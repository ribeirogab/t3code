import { OrchestratorMcpFailure, TrimmedNonEmptyString } from "@t3tools/contracts";
import * as McpSchema from "effect/ai/McpSchema";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as McpInvocationContext from "../../mcp/McpInvocationContext.ts";
import * as ThreadManagementService from "../../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../../project/ProjectService.ts";
import * as WorkflowRunWatches from "./WorkflowRunWatches.ts";

const WatchWorkflowRunTool = Tool.make("watch_workflow_run", {
  description:
    "Watch the GitHub Actions runs of a branch's commit, such as a deploy after a push, and wake this thread once when they end. Call it after the push, then end your turn instead of polling gh run.",
  parameters: Schema.Struct({
    branch: TrimmedNonEmptyString.annotate({ description: "Branch the commit was pushed to." }),
    workflow: Schema.optional(
      TrimmedNonEmptyString.annotate({
        description:
          "Workflow name or file, such as Deploy staging or deploy.yml. Leave out to wait for every run of the commit.",
      }),
    ),
    repository: Schema.optional(
      TrimmedNonEmptyString.annotate({
        description: "owner/name. Default: the project's origin repository.",
      }),
    ),
    sha: Schema.optional(
      TrimmedNonEmptyString.annotate({
        description: "Commit. Default: the branch head on GitHub.",
      }),
    ),
    stop: Schema.optional(
      Schema.Boolean.annotate({ description: "Stop watching this branch and workflow instead." }),
    ),
  }),
  success: Schema.Struct({
    watching: Schema.Boolean,
    repository: Schema.String,
    branch: Schema.String,
    sha: Schema.NullOr(Schema.String),
    workflow: Schema.NullOr(Schema.String),
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    ProjectService.ProjectService,
    WorkflowRunWatches.WorkflowRunWatches,
  ],
})
  .annotate(Tool.Title, "Watch workflow run")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromSubagents);

export const WorkflowRunWatchToolkit = Toolkit.make(WatchWorkflowRunTool);
