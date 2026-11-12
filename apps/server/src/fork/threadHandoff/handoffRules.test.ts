import { describe, expect, it } from "vite-plus/test";
import { parseGoalCommand, ProviderDriverKind, ThreadId } from "@t3tools/contracts";

import {
  continuesFromSource,
  createdThreadLineage,
  goalCommandText,
  goalProblem,
  handoffProblem,
} from "./handoffRules.ts";

const claude = ProviderDriverKind.make("claudeAgent");
const source = ThreadId.make("thread:source");
const root = ThreadId.make("thread:root");
const created = ThreadId.make("thread:created");

describe("handoffProblem", () => {
  it("accepts every placement with only the required fields", () => {
    for (const placement of ["same_worktree", "new_worktree", "child"] as const) {
      expect(handoffProblem({ placement }, claude)).toBeNull();
    }
  });

  it("refuses settle for a child, which follows this thread's Settle status", () => {
    expect(handoffProblem({ placement: "child", settle: true }, claude)).toMatch(/child/);
    expect(handoffProblem({ placement: "same_worktree", settle: true }, claude)).toBeNull();
  });

  it("takes a branch only for a new worktree", () => {
    expect(handoffProblem({ placement: "new_worktree", branch: "fork/next" }, claude)).toBeNull();
    for (const placement of ["same_worktree", "child"] as const) {
      expect(handoffProblem({ placement, branch: "fork/next" }, claude)).toMatch(/new_worktree/);
    }
  });

  it("checks the goal with the goal rules", () => {
    expect(handoffProblem({ placement: "child", goal: "clear" }, claude)).toMatch(/control/);
  });
});

describe("goalProblem", () => {
  it("accepts a done condition for providers with native goals", () => {
    for (const driver of ["codex", "claudeAgent", "opencode"]) {
      expect(goalProblem("all tests pass", ProviderDriverKind.make(driver))).toBeNull();
    }
  });

  it("refuses providers without native goals", () => {
    expect(goalProblem("all tests pass", ProviderDriverKind.make("cursor"))).toMatch(/Codex/);
    expect(goalProblem("all tests pass", undefined)).toMatch(/Codex/);
  });

  it("refuses the /goal control words", () => {
    for (const goal of ["clear", "PAUSE", "resume", "edit"]) {
      expect(goalProblem(goal, claude)).toMatch(/control/);
    }
  });

  it("sends a goal the provider reads back as the same objective", () => {
    const goal = "the PR is open\nand its checks are green";
    expect(parseGoalCommand({ text: goalCommandText(goal) })).toEqual({
      type: "set",
      objective: goal,
    });
  });
});

describe("createdThreadLineage", () => {
  it("starts a plain thread as its own root", () => {
    expect(createdThreadLineage({ threadId: created })).toEqual({
      parentThreadId: null,
      relationshipToParent: null,
      rootThreadId: created,
    });
  });

  it("links a continuation to its source as a detached fork in the source's family", () => {
    const continuesFrom = continuesFromSource({ id: source, lineage: { rootThreadId: root } });
    expect(continuesFrom).toEqual({ threadId: source, rootThreadId: root });
    expect(createdThreadLineage({ threadId: created, continuesFrom })).toEqual({
      parentThreadId: source,
      relationshipToParent: "fork",
      rootThreadId: root,
      detached: true,
    });
  });
});
