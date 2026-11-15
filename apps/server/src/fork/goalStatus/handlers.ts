import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as McpInvocationContext from "../../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../../mcp/McpToolAccess.ts";
import { newCommandId } from "../../mcp/threadAccess.ts";
import * as GoalStatus from "./GoalStatus.ts";
import { GoalStatusToolkit } from "./tools.ts";

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
} satisfies McpToolAccess.Handlers<typeof GoalStatusToolkit.tools>;

export const layer = McpToolAccess.toLayer(GoalStatusToolkit, handlers);
