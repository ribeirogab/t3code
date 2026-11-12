import {
  ForkGoal,
  NodeId,
  OrchestratorMcpFailure,
  RunId,
  ThreadHandoffPlacement,
  ThreadId,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ServerConfig from "../../config.ts";
import * as McpInvocationContext from "../../mcp/McpInvocationContext.ts";
import * as OrchestratorMcpService from "../../mcp/OrchestratorMcpService.ts";
import * as ThreadLaunchService from "../../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagementService from "../../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../../project/ProjectService.ts";
import * as DocumentText from "../../provider/DocumentText.ts";
import * as ProviderRegistry from "../../provider/ProviderRegistry.ts";
import * as GitVcsDriver from "../../vcs/GitVcsDriver.ts";

export const ThreadHandoffParams = Schema.Struct({
  handoff: TrimmedNonEmptyString.check(Schema.isMaxLength(120_000)).annotate({
    description:
      "First message of the new thread. Self-contained: no history comes along. State, next steps, links.",
  }),
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
  placement: Schema.optional(
    ThreadHandoffPlacement.annotate({
      description:
        "'same_worktree' (default): this checkout. 'new_worktree': new checkout from this HEAD; uncommitted edits stay. 'child': a listed child of this thread.",
    }),
  ),
  branch: Schema.optional(
    TrimmedNonEmptyString.annotate({ description: "new_worktree only: the new branch." }),
  ),
  goal: Schema.optional(ForkGoal),
  settle: Schema.optional(
    Schema.Boolean.annotate({ description: "Settle this thread when this turn ends." }),
  ),
});
export type ThreadHandoffParams = typeof ThreadHandoffParams.Type;

const ThreadHandoffTool = Tool.make("t3_thread_handoff", {
  description:
    "Continue this work in a new thread from a short `handoff` you write, linked to this thread. No history is copied. Call it last in your turn. In your reply, name it as its `link` verbatim.",
  parameters: ThreadHandoffParams,
  success: Schema.Struct({
    threadId: ThreadId,
    link: Schema.optional(Schema.String),
    runId: Schema.NullOr(RunId),
    taskId: Schema.optional(NodeId),
    goalQueued: Schema.Boolean,
    settlesWhenTurnEnds: Schema.optional(Schema.Literal(true)),
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    OrchestratorMcpService.OrchestratorMcpService,
    ThreadLaunchService.ThreadLaunchService,
    ProjectService.ProjectService,
    ProviderRegistry.ProviderRegistry,
    GitVcsDriver.GitVcsDriver,
    ServerConfig.ServerConfig,
    FileSystem.FileSystem,
    DocumentText.DocumentText,
    SecureRandom.SecureRandom,
  ],
})
  .annotate(Tool.Title, "Hand off to a new thread")
  .annotate(Tool.Destructive, true)
  .annotate(Tool.OpenWorld, true);

export const ForkThreadHandoffToolkit = Toolkit.make(ThreadHandoffTool);
