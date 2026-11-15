import { OrchestratorMcpFailure, TrimmedNonEmptyString } from "@t3tools/contracts";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as McpInvocationContext from "../../mcp/McpInvocationContext.ts";
import * as ThreadManagementService from "../../orchestration-v2/ThreadManagementService.ts";
import * as CompactAndContinue from "./CompactAndContinue.ts";

const CompactAndContinueTool = Tool.make("t3_thread_compact_and_continue", {
  description:
    "Compact this thread's context and continue in this same thread, which keeps its link, artifacts, and children. When your turn ends, T3 Code runs `/compact`, then sends `message`, then `/goal <goal>`. Use it when the user asks to compact and continue, or to compact and then start a goal. Claude and Codex threads only. Call it last in your turn.",
  parameters: Schema.Struct({
    message: Schema.optional(
      TrimmedNonEmptyString.annotate({
        description:
          "Sent after the compaction: what to do next, with the files, branches, PRs, and decisions it needs.",
      }),
    ),
    goal: Schema.optional(
      TrimmedNonEmptyString.annotate({
        description:
          "Sent last as `/goal <goal>`: what done means for the rest of the work. Only for a long task with several steps.",
      }),
    ),
  }),
  success: Schema.Struct({
    queued: Schema.Array(Schema.String),
    next: Schema.String,
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    CompactAndContinue.CompactAndContinue,
    SecureRandom.SecureRandom,
  ],
})
  .annotate(Tool.Title, "Compact and continue")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

export const CompactAndContinueToolkit = Toolkit.make(CompactAndContinueTool);
