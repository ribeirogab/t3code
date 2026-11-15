import { presentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type ForkThreadAttention,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { resolveSidebarThreadStatus, resolveThreadStatusPill } from "~/components/Sidebar.logic";

import { goalResultLink, resolveGoalStatusCard, resolveNeedsYouBanner } from "./goalStatus.logic";

const OBJECTIVE = "Release v0.0.26-fork.4 published for Linux and Mac";

describe("resolveGoalStatusCard", () => {
  const card = (attention: ForkThreadAttention | null, goalStatus?: "active" | "complete") =>
    resolveGoalStatusCard({
      enabled: true,
      attention,
      goal: goalStatus === undefined ? null : { objective: OBJECTIVE, status: goalStatus },
    });

  it.each([
    [
      "needs you shows the reason",
      { status: "needs_user", reason: "Send the Mac login password", goal: OBJECTIVE },
      { label: "Needs you", tone: "attention" },
      "goal",
      "Send the Mac login password",
    ],
    [
      "blocked shows the reason",
      { status: "blocked", reason: "Fork CI runs out of memory", goal: OBJECTIVE },
      { label: "Blocked", tone: "warning" },
      "goal",
      "Fork CI runs out of memory",
    ],
    [
      "a question pause shows the goal",
      { status: "question", reason: "esses checks rodam no CI?", goal: OBJECTIVE },
      { label: "Paused · you asked a question", tone: "muted" },
      "paused",
      OBJECTIVE,
    ],
    [
      "an answered pause shows the goal",
      { status: "paused", goal: OBJECTIVE },
      { label: "Paused", tone: "muted" },
      "paused",
      OBJECTIVE,
    ],
  ] as const)("%s", (_name, attention, chip, icon, summary) => {
    expect(card(attention)).toEqual({ kind: "held", icon, chip, summary, objective: OBJECTIVE });
  });

  it("shows Done with the result link", () => {
    expect(
      card({
        status: "done",
        reason: "Both releases are published",
        goal: OBJECTIVE,
        result: "https://github.com/acme/app/releases/tag/v0.0.26-fork.4",
      }),
    ).toEqual({
      kind: "done",
      chip: { label: "Done", tone: "success" },
      summary: null,
      result: {
        href: "https://github.com/acme/app/releases/tag/v0.0.26-fork.4",
        label: "Release v0.0.26-fork.4",
      },
    });
  });

  it("shows Done with the goal when the judge met it", () => {
    expect(card({ status: "done", goal: OBJECTIVE }, "complete")).toMatchObject({
      kind: "done",
      summary: OBJECTIVE,
      result: null,
    });
  });

  it.each([
    ["a met goal after Dismiss is gone", card(null, "complete"), "hidden"],
    ["an active goal keeps its card", card(null, "active"), null],
    ["no goal and no status shows nothing new", card(null), null],
  ])("%s", (_name, resolved, expected) => {
    expect(resolved).toBe(expected);
  });

  it("acts like upstream with Goal status off", () => {
    expect(
      resolveGoalStatusCard({
        enabled: false,
        attention: { status: "needs_user", reason: "x", goal: OBJECTIVE },
        goal: { objective: OBJECTIVE, status: "complete" },
      }),
    ).toBeNull();
  });
});

describe("resolveNeedsYouBanner", () => {
  const SUMMARY = "Send the Mac login password to sign the Mac release";
  const requested: ForkThreadAttention = { status: "needs_user", reason: SUMMARY };

  it.each([
    ["shows the summary on a thread without a goal", true, requested, false, SUMMARY],
    ["leaves a thread with a goal to the goal card", true, requested, true, null],
    ["hides after the owner replies", true, null, false, null],
    [
      "leaves a goal's Needs you to the goal card",
      true,
      { ...requested, goal: OBJECTIVE },
      false,
      null,
    ],
    ["acts like upstream with Request attention off", false, requested, false, null],
  ] as const)("%s", (_name, enabled, attention, showsGoal, summary) => {
    expect(resolveNeedsYouBanner({ enabled, attention, showsGoal })).toBe(summary);
  });
});

describe("goalResultLink", () => {
  it.each([
    ["https://github.com/acme/app/pull/57", { label: "PR #57" }],
    ["https://github.com/acme/app/issues/12#top", { label: "Issue #12" }],
    ["https://example.com/report.html", { label: "example.com/report.html" }],
    ["docs/report.md", { href: null, label: "docs/report.md" }],
    ["javascript:alert(1)", { href: null, label: "javascript:alert(1)" }],
  ])("%s", (result, link) => {
    expect(goalResultLink(result)).toMatchObject(link);
  });
});

describe("Needs you in the sidebar", () => {
  const environmentId = EnvironmentId.make("environment-test");
  const now = DateTime.makeUnsafe("2026-01-01T00:00:00.000Z");
  const id = ThreadId.make("thread-test");
  const providerInstanceId = ProviderInstanceId.make("claude");
  const shell = (overrides: Partial<OrchestrationV2ThreadShell>): OrchestrationV2ThreadShell => ({
    id,
    projectId: ProjectId.make("project-test"),
    title: "Thread",
    providerInstanceId,
    modelSelection: { instanceId: providerInstanceId, model: "claude-test" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { rootThreadId: id, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    latestRunId: RunId.make("run-test"),
    latestRunCompletedAt: now,
    activeRunId: null,
    status: "completed",
    pendingRuntimeRequest: null,
    latestVisibleMessage: null,
    latestUserMessageAt: null,
    hasActionableProposedPlan: false,
    itemCount: 0,
    visibleItemCount: 0,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    deletedAt: null,
    goal: null,
    ...overrides,
  });
  const sidebar = (thread: OrchestrationV2ThreadShell) => {
    const presented = presentThreadShell(environmentId, thread);
    return {
      status: resolveSidebarThreadStatus(presented),
      pill: resolveThreadStatusPill({ thread: presented })?.label ?? null,
    };
  };

  it.each([
    ["needs you", { status: "needs_user", reason: "Approve the deploy", goal: OBJECTIVE }],
    ["blocked", { status: "blocked", reason: "CI is out of memory", goal: OBJECTIVE }],
    ["requested", { status: "needs_user", reason: "Approve the deploy" }],
  ] as const)("marks a %s thread Needs you", (_name, forkAttention) => {
    expect(sidebar(shell({ forkAttention }))).toEqual({ status: "input", pill: "Needs you" });
  });

  it.each([
    ["a question pause", { status: "question", reason: "rodam no CI?", goal: OBJECTIVE }],
    ["an answered pause", { status: "paused", goal: OBJECTIVE }],
    ["a done goal", { status: "done", goal: OBJECTIVE }],
  ] as const)("leaves %s out of Needs you", (_name, forkAttention) => {
    expect(sidebar(shell({ forkAttention })).pill).not.toBe("Needs you");
  });

  it("shows Working while the thread runs", () => {
    expect(
      sidebar(
        shell({
          forkAttention: { status: "needs_user", reason: "Approve the deploy", goal: OBJECTIVE },
          activeRunId: RunId.make("run-test"),
          status: "running",
        }),
      ),
    ).toEqual({ status: "working", pill: "Working" });
  });
});
