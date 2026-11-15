import {
  CommandId,
  forkFeatureActive,
  MessageId,
  type OrchestrationV2AppThread,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ServerCommand,
  type OrchestrationV2Subagent,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";

import type { ProjectionStoreV2Error } from "../orchestration-v2/ProjectionStore.ts";

type CaseThread = Pick<
  OrchestrationV2AppThread,
  "id" | "title" | "lineage" | "archivedAt" | "deletedAt" | "settledOverride"
>;

type CaseTask = Pick<OrchestrationV2Subagent, "id" | "childThreadId" | "notifyParent" | "origin">;

type CaseCloseDispatch = Extract<
  OrchestrationV2ServerCommand,
  { readonly type: "message.dispatch" }
>;

export function withOwnerFacing<Params>(toolName: string, params: Params): Params {
  if (toolName !== "delegate_task" || !Predicate.isObject(params)) return params;
  if (!("ownerFacing" in params) || !forkFeatureActive("ownerFacingTasks")) return params;
  const { ownerFacing, ...rest } = params;
  return (
    ownerFacing === true ? { ...rest, listed: true, notifyParent: "on_close" } : rest
  ) as Params;
}

function closedBy(event: OrchestrationV2DomainEvent, child: CaseThread) {
  if (event.type === "thread.archived" && child.archivedAt !== null) return "archiving it";
  if (event.type === "thread.settled" && child.settledOverride === "settled") {
    return "marking it done";
  }
  return null;
}

function caseClosedNotice(input: {
  readonly event: OrchestrationV2DomainEvent;
  readonly parent: CaseThread;
  readonly child: CaseThread;
  readonly task: CaseTask;
}): CaseCloseDispatch | null {
  const { event, parent, child, task } = input;
  if (!forkFeatureActive("ownerFacingTasks") || task.notifyParent !== "on_close") return null;
  if (task.childThreadId !== child.id || child.lineage.parentThreadId !== parent.id) return null;
  if (parent.archivedAt !== null || parent.deletedAt !== null) return null;
  if (parent.settledOverride === "settled") return null;
  const how = closedBy(event, child);
  if (how === null) return null;
  return {
    type: "message.dispatch",
    commandId: CommandId.make(`server:fork-case-closed:${child.id}`),
    threadId: parent.id,
    messageId: MessageId.make(`message:fork-case-closed:${child.id}`),
    text: `The user closed the child thread "${child.title}" (threadId ${child.id}, task ${task.id}) by ${how}. T3 Code sends no other notice for it.`,
    notification: {
      source: { kind: "system" },
      outcome: "completed",
      summary: `${child.title}: closed by the user`,
    },
    attachments: [],
    dispatchMode: { type: "queue_after_active" },
    createdBy: "agent",
    creationSource: "server",
  };
}

export interface CaseCloseReader {
  readonly getThread: (
    threadId: ThreadId,
  ) => Effect.Effect<OrchestrationV2AppThread, ProjectionStoreV2Error>;
  readonly getThreadRecords: (
    threadId: ThreadId,
    fields: ReadonlyArray<"subagents">,
  ) => Effect.Effect<
    { readonly subagents: ReadonlyArray<OrchestrationV2Subagent> },
    ProjectionStoreV2Error
  >;
}

export const caseClosedDispatch = Effect.fn("ForkOwnerFacingTasks.caseClosedDispatch")(function* (
  projections: CaseCloseReader,
  event: OrchestrationV2DomainEvent,
) {
  if (event.type !== "thread.settled" && event.type !== "thread.archived") return null;
  if (!forkFeatureActive("ownerFacingTasks")) return null;
  const child = yield* projections.getThread(event.threadId);
  const parentId = child.lineage.parentThreadId;
  if (parentId === null) return null;
  const { subagents } = yield* projections.getThreadRecords(parentId, ["subagents"]);
  const task = subagents.find(
    (candidate) =>
      candidate.origin === "app_owned" &&
      candidate.childThreadId === child.id &&
      candidate.notifyParent === "on_close",
  );
  if (task === undefined) return null;
  const parent = yield* projections.getThread(parentId);
  return caseClosedNotice({ event, parent, child, task });
});
