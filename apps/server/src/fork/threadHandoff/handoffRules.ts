import {
  parseGoalCommand,
  type ForkContinuesFrom,
  type OrchestrationV2AppThreadLineage,
  type ProviderDriverKind,
  type ThreadHandoffPlacement,
  type ThreadId,
} from "@t3tools/contracts";

const GOAL_DRIVERS: ReadonlySet<string> = new Set(["codex", "claudeAgent", "opencode"]);

export function goalCommandText(goal: string): string {
  return `/goal ${goal}`;
}

export function goalProblem(goal: string, driver: ProviderDriverKind | undefined): string | null {
  if (driver === undefined || !GOAL_DRIVERS.has(driver)) {
    return "`goal` needs a Codex, Claude, or OpenCode thread. Omit it, or pass the goal in the message.";
  }
  const parsed = parseGoalCommand({ text: goalCommandText(goal) });
  if (parsed?.type !== "set" || parsed.objective !== goal) {
    return "`goal` must say what done means, not a /goal control word such as clear, pause, or resume.";
  }
  return null;
}

export interface HandoffRuleInput {
  readonly placement: ThreadHandoffPlacement;
  readonly settle?: boolean | undefined;
  readonly branch?: string | undefined;
  readonly goal?: string | undefined;
}

export function handoffProblem(
  input: HandoffRuleInput,
  driver: ProviderDriverKind | undefined,
): string | null {
  if (input.placement === "child" && input.settle === true) {
    return "A child follows this thread's Settle status, so `settle` cannot be used with placement child.";
  }
  if (input.branch !== undefined && input.placement !== "new_worktree") {
    return "`branch` names the branch of a new worktree. Use it only with placement new_worktree.";
  }
  return input.goal === undefined ? null : goalProblem(input.goal, driver);
}

export function continuesFromSource(source: {
  readonly id: ThreadId;
  readonly lineage: Pick<OrchestrationV2AppThreadLineage, "rootThreadId">;
}): ForkContinuesFrom {
  return { threadId: source.id, rootThreadId: source.lineage.rootThreadId };
}

export function createdThreadLineage(command: {
  readonly threadId: ThreadId;
  readonly continuesFrom?: ForkContinuesFrom | undefined;
}): OrchestrationV2AppThreadLineage {
  if (command.continuesFrom === undefined) {
    return { parentThreadId: null, relationshipToParent: null, rootThreadId: command.threadId };
  }
  return {
    parentThreadId: command.continuesFrom.threadId,
    relationshipToParent: "fork",
    rootThreadId: command.continuesFrom.rootThreadId,
    detached: true,
  };
}
