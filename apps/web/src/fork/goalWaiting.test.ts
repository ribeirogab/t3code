import { presentThreadShell } from "@t3tools/client-runtime/state/shell";
import { isThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { resolveSidebarThreadStatus, resolveThreadStatusPill } from "~/components/Sidebar.logic";

import { holdSnapshotForGoals, holdThreadForGoal } from "./goalWaiting";

const environmentId = EnvironmentId.make("environment-test");
const runId = RunId.make("run-test");

function threadShell(
  overrides: Partial<OrchestrationV2ThreadShell> = {},
): OrchestrationV2ThreadShell {
  const now = DateTime.makeUnsafe("2026-01-01T00:00:00.000Z");
  const id = ThreadId.make("thread-test");
  const providerInstanceId = ProviderInstanceId.make("claude");
  return {
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
    latestRunId: runId,
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
    goal: { objective: "Ship the release", status: "active" },
    ...overrides,
  };
}

function sidebarStatus(thread: OrchestrationV2ThreadShell) {
  const shell = presentThreadShell(environmentId, holdThreadForGoal(thread));
  return {
    status: resolveSidebarThreadStatus(shell),
    pill: resolveThreadStatusPill({ thread: shell })?.label ?? null,
    workingShelf: isThreadWorking(shell),
  };
}

describe("goal waiting", () => {
  it("keeps a settled thread with an active goal in Waiting", () => {
    expect(sidebarStatus(threadShell())).toEqual({
      status: "waiting",
      pill: "Waiting",
      workingShelf: true,
    });
  });

  it("leaves the thread as upstream shows it when the goal is not active", () => {
    for (const goal of [
      null,
      { objective: "Ship the release", status: "paused" as const },
      { objective: "Ship the release", status: "complete" as const },
    ]) {
      expect(sidebarStatus(threadShell({ goal })).status).toBe("ready");
    }
  });

  it("does not turn a running thread or a failed run into Waiting", () => {
    expect(
      sidebarStatus(
        threadShell({ status: "running", activeRunId: runId, latestRunCompletedAt: null }),
      ).status,
    ).toBe("working");
    expect(sidebarStatus(threadShell({ status: "failed" })).status).toBe("failed");
  });

  it("returns the same objects while nothing changes", () => {
    const held = threadShell();
    const plain = threadShell({ goal: null });
    expect(holdThreadForGoal(held)).toBe(holdThreadForGoal(held));
    expect(holdThreadForGoal(plain)).toBe(plain);
    const snapshot = { threads: [plain] };
    expect(holdSnapshotForGoals(snapshot)).toBe(snapshot);
    const heldSnapshot = { threads: [plain, held] };
    expect(holdSnapshotForGoals(heldSnapshot)).toBe(holdSnapshotForGoals(heldSnapshot));
    expect(holdSnapshotForGoals(heldSnapshot)?.threads[0]).toBe(plain);
  });
});
