import * as Schema from "effect/Schema";

import { ThreadId } from "../baseSchemas.ts";

export const ForkContextUsageInput = Schema.Struct({
  threadId: ThreadId,
  /** Client cache key only: the context size the client shows, so a new turn reads again. */
  revision: Schema.optional(Schema.Number),
});
export type ForkContextUsageInput = typeof ForkContextUsageInput.Type;

export const ForkContextUsageCategory = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  tokens: Schema.Number,
  kind: Schema.Literals(["used", "free", "buffer", "deferred"]),
});
export type ForkContextUsageCategory = typeof ForkContextUsageCategory.Type;

export const ForkContextUsageEntry = Schema.Struct({
  name: Schema.String,
  tokens: Schema.Number,
});
export type ForkContextUsageEntry = typeof ForkContextUsageEntry.Type;

export const ForkContextUsageGroup = Schema.Struct({
  id: Schema.Literals(["mcpTools", "memoryFiles", "agents"]),
  name: Schema.String,
  count: Schema.Number,
  entries: Schema.Array(ForkContextUsageEntry),
});
export type ForkContextUsageGroup = typeof ForkContextUsageGroup.Type;

export const ForkContextUsage = Schema.Struct({
  totalTokens: Schema.Number,
  maxTokens: Schema.Number,
  categories: Schema.Array(ForkContextUsageCategory),
  groups: Schema.Array(ForkContextUsageGroup),
});
export type ForkContextUsage = typeof ForkContextUsage.Type;

export class ForkContextUsageError extends Schema.TaggedError<ForkContextUsageError>()(
  "ForkContextUsageError",
  {
    threadId: ThreadId,
    reason: Schema.Literals(["provider-unsupported", "session-stopped", "request-failed"]),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    switch (this.reason) {
      case "provider-unsupported":
        return "This thread's provider does not report a context breakdown.";
      case "session-stopped":
        return "The thread's session is not running.";
      case "request-failed":
        return "The context breakdown request failed.";
    }
  }
}
