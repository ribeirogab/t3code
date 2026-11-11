import {
  CommandId,
  isProviderNativeSubagentThread,
  ThreadId,
  type EventId,
  type OrchestrationV2AppThread,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ServerCommand,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import * as SqlClient from "effect/sql/SqlClient";
import * as Stream from "effect/Stream";

import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import { forkParked } from "../serverActivation.ts";

type StatusThread = Pick<
  OrchestrationV2AppThread,
  | "id"
  | "lineage"
  | "creationSource"
  | "archivedAt"
  | "deletedAt"
  | "settledOverride"
  | "snoozedUntil"
>;

type StatusCommand = Extract<
  OrchestrationV2ServerCommand,
  { readonly type: "thread.settle" | "thread.unsettle" | "thread.snooze" | "thread.unsnooze" }
>;

const PARENT_STATUS_EVENTS: ReadonlySet<OrchestrationV2DomainEvent["type"]> = new Set([
  "thread.settled",
  "thread.unsettled",
  "thread.snoozed",
  "thread.unsnoozed",
  "thread.pinned",
]);

const FINISHED_RUN_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

function followsParentStatus(thread: StatusThread): boolean {
  return (
    thread.lineage.parentThreadId !== null &&
    thread.lineage.sideChat !== true &&
    thread.lineage.detached !== true &&
    thread.archivedAt === null &&
    thread.deletedAt === null &&
    !isProviderNativeSubagentThread(thread)
  );
}

function liveSnoozeUntil(thread: StatusThread, now: DateTime.Utc): DateTime.Utc | null {
  const until = thread.snoozedUntil ?? null;
  return until !== null && DateTime.toEpochMillis(until) > DateTime.toEpochMillis(now)
    ? until
    : null;
}

function childStatusCommands(input: {
  readonly parent: StatusThread;
  readonly child: StatusThread;
  readonly now: DateTime.Utc;
  readonly cause: EventId;
}): ReadonlyArray<StatusCommand> {
  const { parent, child, now } = input;
  const threadId = child.id;
  const commandId = (action: string) =>
    CommandId.make(`server:fork-child-status:${input.cause}:${threadId}:${action}`);
  const parentSettled = parent.settledOverride === "settled";
  const childSettled = child.settledOverride === "settled";
  const settles = parentSettled && !childSettled;
  const commands: StatusCommand[] = [];
  if (settles) {
    commands.push({ type: "thread.settle", commandId: commandId("settle"), threadId });
  } else if (!parentSettled && childSettled) {
    commands.push({
      type: "thread.unsettle",
      commandId: commandId("unsettle"),
      threadId,
      reason: "user",
    });
  }
  const parentSnooze = liveSnoozeUntil(parent, now);
  const childSnooze = settles ? null : liveSnoozeUntil(child, now);
  const childSnoozedUntil = settles ? null : (child.snoozedUntil ?? null);
  if (parentSnooze !== null) {
    if (
      childSnooze === null ||
      DateTime.toEpochMillis(childSnooze) !== DateTime.toEpochMillis(parentSnooze)
    ) {
      commands.push({
        type: "thread.snooze",
        commandId: commandId("snooze"),
        threadId,
        snoozedUntil: DateTime.formatIso(parentSnooze),
      });
    }
  } else if (parent.snoozedUntil == null && childSnoozedUntil !== null) {
    commands.push({
      type: "thread.unsnooze",
      commandId: commandId("unsnooze"),
      threadId,
      reason: "user",
    });
  }
  return commands;
}

function changesSnooze(event: OrchestrationV2DomainEvent): boolean {
  if (event.type !== "thread.metadata-updated") return false;
  const at = DateTime.toEpochMillis(event.occurredAt);
  const { snoozedAt, lastSnoozeWakeAt } = event.payload;
  return (
    (snoozedAt != null && DateTime.toEpochMillis(snoozedAt) === at) ||
    (lastSnoozeWakeAt != null && DateTime.toEpochMillis(lastSnoozeWakeAt) === at)
  );
}

export class ChildStatusReactor extends Context.Service<
  ChildStatusReactor,
  {
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
    readonly handle: (event: OrchestrationV2DomainEvent) => Effect.Effect<void>;
  }
>()("t3/fork/ChildStatusReactor") {}

const make = Effect.gen(function* () {
  const engine = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const sql = yield* SqlClient.SqlClient;

  const childIdsOf = (parentThreadId: ThreadId) =>
    sql<{ readonly thread_id: string }>`
      SELECT thread_id
      FROM orchestration_v2_projection_threads
      WHERE deleted_at IS NULL
        AND json_extract(payload_json, '$.lineage.parentThreadId') = ${parentThreadId}
        AND json_extract(payload_json, '$.archivedAt') IS NULL
    `.pipe(Effect.map((rows) => rows.map((row) => ThreadId.make(row.thread_id))));

  const follow = Effect.fnUntraced(function* (
    parent: StatusThread,
    child: StatusThread,
    cause: EventId,
  ) {
    if (!followsParentStatus(child) || child.lineage.parentThreadId !== parent.id) return;
    const now = yield* DateTime.now;
    for (const command of childStatusCommands({ parent, child, now, cause })) {
      yield* engine.dispatch(command).pipe(
        Effect.catchCause((failure) =>
          Effect.logDebug("a child thread could not follow its parent status", {
            threadId: child.id,
            commandType: command.type,
            cause: failure,
          }),
        ),
      );
    }
  });

  const handle: ChildStatusReactor["Service"]["handle"] = Effect.fnUntraced(
    function* (event) {
      if (PARENT_STATUS_EVENTS.has(event.type) || changesSnooze(event)) {
        const parent = yield* projections.getThread(event.threadId);
        for (const childId of yield* childIdsOf(parent.id)) {
          const child = yield* projections.getThread(childId);
          yield* follow(parent, child, event.id);
        }
        return;
      }
      if (event.type !== "run.updated" || !FINISHED_RUN_STATUSES.has(event.payload.status)) return;
      const child = yield* projections.getThread(event.threadId);
      if (!followsParentStatus(child) || child.lineage.parentThreadId === null) return;
      const parent = yield* projections.getThread(child.lineage.parentThreadId);
      yield* follow(parent, child, event.id);
    },
    (effect, event) =>
      effect.pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("a child thread could not follow its parent status", {
            threadId: event.threadId,
            cause,
          }),
        ),
      ),
  );

  const start: ChildStatusReactor["Service"]["start"] = () =>
    forkParked(
      Stream.runForEach(engine.streamDomainEvents, handle).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("child status event stream failed", { cause }),
        ),
      ),
    );

  return { start, handle } satisfies ChildStatusReactor["Service"];
});

export const layer = Layer.effect(ChildStatusReactor, make);

export const layerStarted = Layer.effectDiscard(
  Effect.gen(function* () {
    const reactor = yield* ChildStatusReactor;
    yield* reactor.start();
  }),
).pipe(Layer.provide(layer), Layer.provide(ProjectionStore.layer));
