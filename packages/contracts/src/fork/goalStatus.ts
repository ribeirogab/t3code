import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "../baseSchemas.ts";

const FORK_ATTENTION_REASON_MAX_CHARS = 500;
const FORK_GOAL_RESULT_MAX_CHARS = 2_000;

export const ForkGoalUpdateStatus = Schema.Literals(["done", "blocked", "needs_user"]);
export type ForkGoalUpdateStatus = typeof ForkGoalUpdateStatus.Type;

const ForkThreadAttentionStatus = Schema.Literals([
  "needs_user",
  "blocked",
  "question",
  "paused",
  "done",
]);

export const ForkAttentionReason = TrimmedNonEmptyString.check(
  Schema.isMaxLength(FORK_ATTENTION_REASON_MAX_CHARS),
);

export const ForkGoalResult = TrimmedNonEmptyString.check(
  Schema.isMaxLength(FORK_GOAL_RESULT_MAX_CHARS),
);

export const ForkThreadAttention = Schema.Struct({
  status: ForkThreadAttentionStatus,
  reason: Schema.optional(ForkAttentionReason),
  goal: Schema.optional(TrimmedNonEmptyString),
  result: Schema.optional(ForkGoalResult),
});
export type ForkThreadAttention = typeof ForkThreadAttention.Type;

export function threadNeedsYou(attention: ForkThreadAttention | null | undefined): boolean {
  return attention?.status === "needs_user" || attention?.status === "blocked";
}
