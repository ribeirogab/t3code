import {
  CommandId,
  MessageId,
  OrchestratorMcpFailure,
  type ProjectId,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type * as ThreadManagement from "../../orchestration-v2/ThreadManagementService.ts";
import { goalCommandText, goalProblem } from "./handoffRules.ts";

interface ProviderDriver {
  readonly instanceId: ProviderInstanceId;
  readonly driver: ProviderDriverKind;
}

function invalidRequest(message: string) {
  return new OrchestratorMcpFailure({ code: "invalid_request", message });
}

export function requireGoalSupport(
  goal: string | undefined,
  providers: ReadonlyArray<ProviderDriver>,
  instanceId: ProviderInstanceId,
): Effect.Effect<void, OrchestratorMcpFailure> {
  if (goal === undefined) return Effect.void;
  const driver = providers.find((provider) => provider.instanceId === instanceId)?.driver;
  const problem = goalProblem(goal, driver);
  return problem === null ? Effect.void : Effect.fail(invalidRequest(problem));
}

export function refuseRemoteGoal(
  goal: string | undefined,
): Effect.Effect<void, OrchestratorMcpFailure> {
  return goal === undefined
    ? Effect.void
    : Effect.fail(invalidRequest("`goal` works only for a child in this environment."));
}

function goalCommandId(commandId: CommandId): CommandId {
  return CommandId.make(`${commandId}:goal`);
}

function goalNotQueued(error: unknown) {
  const detail = error instanceof Error && error.message.length > 0 ? ` ${error.message}` : "";
  return new OrchestratorMcpFailure({
    code: "orchestration_error",
    message: `The thread started, but its goal was not queued.${detail}`,
  });
}

export const queueGoal = Effect.fn("fork.threadHandoff.queueGoal")(function* (
  threads: Pick<ThreadManagement.ThreadManagementService["Service"], "sendToThread">,
  input: {
    readonly goal: string | undefined;
    readonly projectId: ProjectId;
    readonly threadId: ThreadId;
    readonly senderThreadId: ThreadId;
    readonly commandId: CommandId;
  },
) {
  if (input.goal === undefined) return false;
  const commandId = goalCommandId(input.commandId);
  yield* threads
    .sendToThread({
      projectId: input.projectId,
      commandId,
      threadId: input.threadId,
      messageId: MessageId.make(commandId),
      senderThreadId: input.senderThreadId,
      text: goalCommandText(input.goal),
      attachments: [],
      mode: "queue",
      createdBy: "agent",
      creationSource: "mcp",
    })
    .pipe(Effect.mapError(goalNotQueued));
  return true;
});
