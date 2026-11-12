import * as Schema from "effect/Schema";

import { ThreadId, TrimmedNonEmptyString } from "../baseSchemas.ts";

const FORK_GOAL_MAX_CHARS = 4_000;

export const ForkGoal = TrimmedNonEmptyString.check(
  Schema.isMaxLength(FORK_GOAL_MAX_CHARS),
).annotate({
  description: "What done means. Runs as `/goal` after the first turn.",
});
export type ForkGoal = typeof ForkGoal.Type;

export const ForkContinuesFrom = Schema.Struct({
  threadId: ThreadId,
  rootThreadId: ThreadId,
});
export type ForkContinuesFrom = typeof ForkContinuesFrom.Type;

export const ThreadHandoffPlacement = Schema.Literals(["same_worktree", "new_worktree", "child"]);
export type ThreadHandoffPlacement = typeof ThreadHandoffPlacement.Type;
