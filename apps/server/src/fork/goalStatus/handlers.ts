import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as McpInvocationContext from "../../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../../mcp/McpToolAccess.ts";
import { newCommandId } from "../../mcp/threadAccess.ts";
import * as GoalStatus from "./GoalStatus.ts";
import { GoalStatusToolkit } from "./tools.ts";

const REQUEST_ATTENTION_NEXT: Record<GoalStatus.AttentionRequestOutcome, string> = {
  goal: "The goal is paused and the user sees your summary as Needs you. End your turn now.",
  thread: "The thread shows Needs you with your summary until the user replies. End your turn now.",
  parent:
    "Your parent thread got your summary and replies here when it has the answer. End your turn now.",
};

const handlers = {
  t3_goal_update: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, "t3_goal_update");
      const goals = yield* GoalStatus.GoalStatus;
      const attention = yield* goals
        .update({
          commandId: yield* newCommandId(),
          threadId: thread.threadId,
          status: input.status,
          reason: input.reason,
          result: input.result,
        })
        .pipe(
          Effect.mapError(
            (error) =>
              new OrchestratorMcpFailure({ code: "invalid_request", message: error.detail }),
          ),
        );
      return {
        status: input.status,
        next:
          attention.status === "done"
            ? "The goal is cleared and the user sees it as done. End your turn."
            : "The goal is paused and the user sees your reason. End your turn now.",
      };
    }),
  ),
  t3_request_attention: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(
        scope,
        "t3_request_attention",
      );
      const goals = yield* GoalStatus.GoalStatus;
      const outcome = yield* goals
        .request({
          commandId: yield* newCommandId(),
          threadId: thread.threadId,
          summary: input.summary,
        })
        .pipe(
          Effect.mapError(
            (error) =>
              new OrchestratorMcpFailure({ code: "invalid_request", message: error.detail }),
          ),
        );
      return { next: REQUEST_ATTENTION_NEXT[outcome] };
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof GoalStatusToolkit.tools>;

export const layer = McpToolAccess.toLayer(GoalStatusToolkit, handlers);
