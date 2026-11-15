import {
  ForkAttentionReason,
  ForkGoalResult,
  ForkGoalUpdateStatus,
  OrchestratorMcpFailure,
} from "@t3tools/contracts";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as McpSchema from "effect/ai/McpSchema";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as McpInvocationContext from "../../mcp/McpInvocationContext.ts";
import * as ThreadManagementService from "../../orchestration-v2/ThreadManagementService.ts";
import * as GoalStatus from "./GoalStatus.ts";

const GoalUpdateTool = Tool.make("t3_goal_update", {
  description:
    "End or pause this thread's /goal instead of repeating a request in your reply. T3 Code clears the goal, stops this turn and shows `reason` on the goal card. For a question, use your question tool instead: the goal waits for the answer.",
  parameters: Schema.Struct({
    status: ForkGoalUpdateStatus.annotate({
      description:
        "'needs_user': only the user can do the next step (an approval, a login, an action on their machine). 'blocked': a criterion cannot become true as written. 'done': the goal is met.",
    }),
    reason: ForkAttentionReason.annotate({
      description: "One line for the user: what you need, what blocks, or what is done.",
    }),
    result: Schema.optional(
      ForkGoalResult.annotate({ description: "done only: the result's link, such as the PR URL." }),
    ),
  }),
  success: Schema.Struct({
    status: ForkGoalUpdateStatus,
    next: Schema.String,
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    GoalStatus.GoalStatus,
    SecureRandom.SecureRandom,
  ],
})
  .annotate(Tool.Title, "Update goal")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

const RequestAttentionTool = Tool.make("t3_request_attention", {
  description:
    "Tell the user that the next step is theirs: an answer, an ok, a login, or an action on their machine. The thread leaves Working, shows Needs you with `summary`, and notifies the user, with no form. Put the full request in your reply too, then end your turn; the user's next message clears it. Not for a status that needs nothing from the user.",
  parameters: Schema.Struct({
    summary: ForkAttentionReason.annotate({
      description: "One line for the user: what they must do or decide.",
    }),
  }),
  success: Schema.Struct({ next: Schema.String }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    GoalStatus.GoalStatus,
    SecureRandom.SecureRandom,
  ],
})
  .annotate(Tool.Title, "Request attention")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

export const GoalStatusToolkit = Toolkit.make(GoalUpdateTool, RequestAttentionTool);
