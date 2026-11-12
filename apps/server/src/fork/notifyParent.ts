import type {
  ForkNotifyParent,
  NodeId,
  OrchestrationV2ConversationMessage,
  OrchestrationV2ExecutionNode,
  OrchestrationV2Run,
  OrchestrationV2RuntimeRequest,
  OrchestrationV2Subagent,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { ProjectionStoreV2Error } from "../orchestration-v2/ProjectionStore.ts";

export type ChildWakeEvent = "finish" | "question";

export type TurnStarter = Pick<
  OrchestrationV2ConversationMessage,
  "createdBy" | "creationSource" | "senderThreadId" | "text"
>;

const SLASH_COMMAND = /^\/[A-Za-z][\w:.-]*(?:\s|$)/;

export function isSlashCommandOnly(text: string): boolean {
  return SLASH_COMMAND.test(text.trim());
}

function typedInChildByOwner(starter: TurnStarter): boolean {
  return (
    starter.createdBy === "user" &&
    (starter.creationSource === "web" || starter.creationSource === "mobile") &&
    starter.senderThreadId === undefined
  );
}

function turnStaysInChild(starter: TurnStarter | undefined): boolean {
  return (
    starter !== undefined && (typedInChildByOwner(starter) || isSlashCommandOnly(starter.text))
  );
}

function optionWakesParent(notifyParent: ForkNotifyParent, event: ChildWakeEvent): boolean {
  switch (notifyParent) {
    case "on_finish":
      return true;
    case "on_question":
      return event === "question";
    case "never":
      return false;
  }
}

export function childEventWakesParent(input: {
  readonly notifyParent: ForkNotifyParent | undefined;
  readonly event: ChildWakeEvent;
  readonly starter: TurnStarter | undefined;
}): boolean {
  return (
    !turnStaysInChild(input.starter) &&
    optionWakesParent(input.notifyParent ?? "on_finish", input.event)
  );
}

export function mayWakeParentOnFinish(task: Pick<OrchestrationV2Subagent, "notifyParent">) {
  return optionWakesParent(task.notifyParent ?? "on_finish", "finish");
}

const QUIET_COMPLETION = {
  completionDelivery: { state: "disposed" as const, observedByRunId: null },
};

export function quietCompletion(
  task: Pick<OrchestrationV2Subagent, "notifyParent">,
  childRun: Pick<OrchestrationV2Run, "userMessageId">,
  childMessages: ReadonlyArray<Pick<OrchestrationV2ConversationMessage, "id"> & TurnStarter>,
): Partial<Pick<OrchestrationV2Subagent, "completionDelivery">> {
  const starter = childMessages.find((message) => message.id === childRun.userMessageId);
  return childEventWakesParent({ notifyParent: task.notifyParent, event: "finish", starter })
    ? {}
    : QUIET_COMPLETION;
}

export interface ChildTurnReader {
  readonly getThreadRecords: (
    threadId: ThreadId,
    fields: ReadonlyArray<"nodes">,
    filter: { readonly nodeIds: ReadonlyArray<NodeId> },
  ) => Effect.Effect<
    { readonly nodes: ReadonlyArray<Pick<OrchestrationV2ExecutionNode, "runId">> },
    ProjectionStoreV2Error
  >;
  readonly getRunMessage: (
    threadId: ThreadId,
    runId: RunId,
  ) => Effect.Effect<TurnStarter | undefined, ProjectionStoreV2Error>;
}

const childTurnStarter = Effect.fnUntraced(function* (
  projections: ChildTurnReader,
  childThreadId: ThreadId,
  nodeId: NodeId,
) {
  const { nodes } = yield* projections.getThreadRecords(childThreadId, ["nodes"], {
    nodeIds: [nodeId],
  });
  const runId = nodes[0]?.runId ?? null;
  return runId === null ? undefined : yield* projections.getRunMessage(childThreadId, runId);
});

export const questionWakesParent = Effect.fn("ForkNotifyParent.questionWakesParent")(function* (
  projections: ChildTurnReader,
  task: Pick<OrchestrationV2Subagent, "childThreadId" | "notifyParent">,
  request: Pick<OrchestrationV2RuntimeRequest, "nodeId">,
) {
  const starter =
    task.childThreadId === null
      ? undefined
      : yield* childTurnStarter(projections, task.childThreadId, request.nodeId).pipe(
          Effect.orElseSucceed(() => undefined),
        );
  return childEventWakesParent({ notifyParent: task.notifyParent, event: "question", starter });
});
