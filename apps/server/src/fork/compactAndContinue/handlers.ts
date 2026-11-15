import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as McpInvocationContext from "../../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../../mcp/McpToolAccess.ts";
import { newCommandId } from "../../mcp/threadAccess.ts";
import * as CompactAndContinue from "./CompactAndContinue.ts";
import { CompactAndContinueToolkit } from "./tools.ts";

const TOOL_NAME = "t3_thread_compact_and_continue";

const handlers = {
  [TOOL_NAME]: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, TOOL_NAME);
      const compaction = yield* CompactAndContinue.CompactAndContinue;
      const queued = yield* compaction
        .queue({
          commandId: yield* newCommandId(),
          threadId: thread.threadId,
          message: input.message,
          goal: input.goal,
        })
        .pipe(
          Effect.mapError(
            (error) =>
              new OrchestratorMcpFailure({ code: "invalid_request", message: error.detail }),
          ),
        );
      return {
        queued,
        next: "They run in this order after your turn. End your turn now.",
      };
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof CompactAndContinueToolkit.tools>;

export const layer = McpToolAccess.toLayer(CompactAndContinueToolkit, handlers);
