import {
  CommandId,
  MessageId,
  OrchestratorMcpFailure,
  ThreadId,
  type OrchestrationV2AppThread,
  type OrchestrationV2ThreadLaunchWorkspaceStrategy,
  type ProviderInstanceId,
  type ThreadHandoffPlacement,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as McpInvocationContext from "../../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../../mcp/McpToolAccess.ts";
import * as OrchestratorMcpService from "../../mcp/OrchestratorMcpService.ts";
import { newCommandId, readCaller, unavailable } from "../../mcp/threadAccess.ts";
import { OrchestratorRuntimeModeAboveCeilingError } from "../../orchestration-v2/Orchestrator.ts";
import * as ThreadLaunch from "../../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagement from "../../orchestration-v2/ThreadManagementService.ts";
import * as ThreadMessageIntake from "../../orchestration-v2/ThreadMessageIntake.ts";
import * as ProjectService from "../../project/ProjectService.ts";
import * as ProviderRegistry from "../../provider/ProviderRegistry.ts";
import * as GitVcsDriver from "../../vcs/GitVcsDriver.ts";
import { queueGoal } from "./goalQueue.ts";
import { continuesFromSource, handoffProblem } from "./handoffRules.ts";
import { ForkThreadHandoffToolkit, type ThreadHandoffParams } from "./tools.ts";

const isAboveCeilingError = Schema.is(OrchestratorRuntimeModeAboveCeilingError);

function handoffFailure(code: OrchestratorMcpFailure["code"], message: string) {
  return new OrchestratorMcpFailure({ code, message });
}

const requireHandoffRules = Effect.fn("fork.threadHandoff.requireRules")(function* (
  input: ThreadHandoffParams,
  placement: ThreadHandoffPlacement,
  instanceId: ProviderInstanceId,
) {
  const providers = yield* ProviderRegistry.ProviderRegistry.pipe(
    Effect.flatMap((registry) => registry.getProviders),
  );
  const driver = providers.find((provider) => provider.instanceId === instanceId)?.driver;
  const problem = handoffProblem({ ...input, placement }, driver);
  if (problem !== null) return yield* handoffFailure("invalid_request", problem);
});

const newWorktreeStrategy = Effect.fn("fork.threadHandoff.newWorktreeStrategy")(function* (
  source: OrchestrationV2AppThread,
  branch: string | undefined,
) {
  const project = yield* ProjectService.ProjectService.pipe(
    Effect.flatMap((projects) => projects.getById(source.projectId)),
    Effect.mapError(unavailable),
    Effect.map(Option.getOrUndefined),
  );
  if (project === undefined) return yield* handoffFailure("invalid_request", "No project.");
  const git = yield* GitVcsDriver.GitVcsDriver;
  const head = yield* git
    .resolveCommit({ cwd: source.worktreePath ?? project.workspaceRoot, revision: "HEAD" })
    .pipe(
      Effect.mapError(() =>
        handoffFailure("invalid_request", "Unable to resolve this checkout's commit."),
      ),
    );
  const strategy: OrchestrationV2ThreadLaunchWorkspaceStrategy = {
    type: "worktree",
    baseRef: head.commitSha,
    startFromOrigin: false,
    ...(branch === undefined ? {} : { branch }),
  };
  yield* ThreadLaunch.ThreadLaunchService.pipe(
    Effect.flatMap((launches) =>
      launches.checkWorktreeBase({ projectId: source.projectId, workspaceStrategy: strategy }),
    ),
    Effect.mapError((error) =>
      handoffFailure("invalid_request", `${error.message} No thread was created.`),
    ),
  );
  return strategy;
});

function sameWorktreeStrategy(
  source: OrchestrationV2AppThread,
): OrchestrationV2ThreadLaunchWorkspaceStrategy {
  const branch = source.branch === null ? {} : { branch: source.branch };
  return source.worktreePath === null
    ? { type: "root", ...branch }
    : { type: "existing_worktree", worktreePath: source.worktreePath, ...branch };
}

function launchFailure(
  error:
    | ThreadLaunch.ThreadLaunchError
    | ThreadManagement.ThreadManagementProviderInstanceDisabledError,
) {
  if (error._tag === "ThreadManagementProviderInstanceDisabledError")
    return handoffFailure("invalid_request", error.message);
  if (isAboveCeilingError(error.cause))
    return handoffFailure("invalid_request", error.cause.message);
  return unavailable();
}

const handOffToNewThread = Effect.fn("fork.threadHandoff.newThread")(function* (
  input: ThreadHandoffParams,
  modes: McpToolAccess.StartedModes,
) {
  const scope = yield* McpInvocationContext.McpInvocationContext;
  const callerScope = yield* McpInvocationContext.requireThreadScope(scope, "t3_thread_handoff");
  const { threads } = yield* readCaller();
  const source = yield* threads
    .getThreadRecords(callerScope.thread.threadId, ["runs"])
    .pipe(Effect.mapError(unavailable));
  const sourceRun = ThreadManagement.latestActiveRun(source);
  if (
    sourceRun === undefined ||
    sourceRun.rootNodeId === null ||
    sourceRun.providerInstanceId !== callerScope.thread.providerInstanceId
  )
    return yield* handoffFailure(
      "parent_not_active",
      "A handoff needs an active run owned by this MCP provider session.",
    );
  const placement = input.placement ?? "same_worktree";
  yield* requireHandoffRules(input, placement, source.thread.modelSelection.instanceId);
  const workspaceStrategy =
    placement === "new_worktree"
      ? yield* newWorktreeStrategy(source.thread, input.branch)
      : sameWorktreeStrategy(source.thread);
  const commandId = yield* newCommandId();
  const threadId = ThreadId.make(commandId);
  const messageId = MessageId.make(commandId);
  const launched = yield* ThreadMessageIntake.launchThread({
    commandId,
    threadId,
    projectId: source.thread.projectId,
    title: input.title,
    modelSelection: source.thread.modelSelection,
    runtimeMode: modes.runtimeMode,
    interactionMode: modes.interactionMode,
    workspaceStrategy,
    initialMessage: {
      messageId,
      senderThreadId: source.thread.id,
      text: input.handoff,
      attachments: [],
    },
    createdBy: "agent",
    creationSource: "mcp",
    ...(modes.linkOrigin === undefined ? {} : { linkOrigin: modes.linkOrigin }),
    continuesFrom: continuesFromSource(source.thread),
  }).pipe(
    Effect.mapError((error) =>
      error._tag === "AttachmentClaimError" ? unavailable() : launchFailure(error),
    ),
  );
  const run = launched.projection.runs.find((candidate) => candidate.userMessageId === messageId);
  const goalQueued = yield* queueGoal(threads, {
    goal: input.goal,
    projectId: source.thread.projectId,
    threadId,
    senderThreadId: source.thread.id,
    commandId,
  });
  yield* threads
    .dispatch({
      type: "thread.created.record",
      commandId: CommandId.make(`${commandId}:record`),
      parentThreadId: source.thread.id,
      parentRunId: sourceRun.id,
      parentNodeId: sourceRun.rootNodeId,
      targetThreadId: threadId,
      targetRunId: run?.id ?? null,
    })
    .pipe(Effect.mapError(unavailable));
  const settled =
    input.settle === true
      ? yield* threads
          .settleThread({
            threadId: source.thread.id,
            commandId: CommandId.make(`${commandId}:settle`),
            byOwnAgent: true,
          })
          .pipe(Effect.mapError(unavailable))
      : undefined;
  return {
    threadId,
    link: McpInvocationContext.threadLinkFor(scope, threadId, launched.projection.thread.title),
    runId: run?.id ?? null,
    goalQueued,
    ...(settled !== undefined && "settlesWhenTurnEnds" in settled
      ? { settlesWhenTurnEnds: true as const }
      : {}),
  };
});

const handOffToChild = Effect.fn("fork.threadHandoff.child")(function* (
  input: ThreadHandoffParams,
) {
  const scope = yield* McpInvocationContext.McpInvocationContext;
  const callerScope = yield* McpInvocationContext.requireThreadScope(scope, "t3_thread_handoff");
  const { caller } = yield* readCaller();
  if (caller !== undefined)
    yield* requireHandoffRules(input, "child", caller.modelSelection.instanceId);
  const service = yield* OrchestratorMcpService.OrchestratorMcpService;
  const task = yield* service.delegateTask(callerScope, {
    task: input.handoff,
    title: input.title,
    listed: true,
    ...(input.goal === undefined ? {} : { goal: input.goal }),
  });
  if (task.childThreadId === null)
    return yield* handoffFailure("orchestration_error", "The child thread was not created.");
  return {
    threadId: task.childThreadId,
    ...(task.link === undefined ? {} : { link: task.link }),
    runId: task.childRunId,
    taskId: task.taskId,
    goalQueued: input.goal !== undefined,
  };
});

export const layer = McpToolAccess.toLayer(ForkThreadHandoffToolkit, {
  t3_thread_handoff: McpToolAccess.either(
    (input) => input.placement === "child",
    McpToolAccess.actsAsCaller(handOffToChild),
    McpToolAccess.startsThreads(() => ({}), handOffToNewThread, "stamped"),
  ),
});
