import { type OrchestrationProjectShell, OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as McpInvocationContext from "../../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../../mcp/McpToolAccess.ts";
import { loadCaller } from "../../mcp/threadAccess.ts";
import * as ProjectService from "../../project/ProjectService.ts";
import type { GitHubRepository } from "../gitHubCli.ts";
import { WorkflowRunWatchToolkit } from "./tools.ts";
import * as WorkflowRunWatches from "./WorkflowRunWatches.ts";

const failure = (message: string) =>
  new OrchestratorMcpFailure({ code: "orchestration_error", message });

function repositoryFromKey(key: string): GitHubRepository | null {
  const [host, owner, name, ...rest] = key.split("/");
  return host && owner && name && rest.length === 0
    ? { host, repository: `${owner}/${name}` }
    : null;
}

const requestedRepository = (requested: string) =>
  repositoryFromKey(requested.split("/").length === 2 ? `github.com/${requested}` : requested);

const projectRepository = (project: OrchestrationProjectShell | undefined) => {
  const identity = project?.repositoryIdentity;
  return identity == null
    ? null
    : repositoryFromKey(identity.origin?.canonicalKey ?? identity.canonicalKey);
};

const resolveRepository = Effect.fn("WorkflowRunWatch.resolveRepository")(function* (
  requested: string | undefined,
  projectId: OrchestrationProjectShell["id"],
) {
  if (requested !== undefined) {
    const repository = requestedRepository(requested);
    if (repository === null) {
      return yield* failure(`Pass repository as owner/name, not ${requested}.`);
    }
    return repository;
  }
  const projects = yield* ProjectService.ProjectService;
  const project = yield* projects.getShell(projectId).pipe(
    Effect.map(Option.getOrUndefined),
    Effect.orElseSucceed(() => undefined),
  );
  const repository = projectRepository(project);
  if (repository === null) {
    return yield* failure("This project has no GitHub remote. Pass repository as owner/name.");
  }
  return repository;
});

const handlers = {
  watch_workflow_run: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(
        scope,
        "watch_workflow_run",
      );
      const { caller } = yield* loadCaller();
      if (caller === undefined || caller.lineage.relationshipToParent === "subagent") {
        return yield* failure(
          "This thread is a subagent, so it cannot watch workflow runs. Finish your task and report back to the parent thread instead.",
        );
      }
      const repository = yield* resolveRepository(input.repository, caller.projectId);
      const watches = yield* WorkflowRunWatches.WorkflowRunWatches;
      const workflow = input.workflow ?? null;
      if (input.stop === true) {
        yield* watches.stop({ threadId: thread.threadId, branch: input.branch, workflow });
        return {
          watching: false,
          repository: repository.repository,
          branch: input.branch,
          sha: null,
          workflow,
        };
      }
      const watch = yield* watches
        .watch({
          threadId: thread.threadId,
          ...repository,
          branch: input.branch,
          workflow,
          sha: input.sha ?? null,
        })
        .pipe(Effect.mapError((error) => failure(error.detail)));
      return {
        watching: true,
        repository: watch.repository,
        branch: watch.branch,
        sha: watch.sha,
        workflow: watch.workflow,
      };
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof WorkflowRunWatchToolkit.tools>;

export const layer = McpToolAccess.toLayer(WorkflowRunWatchToolkit, handlers);
