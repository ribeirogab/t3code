import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  NodeId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeRequestId,
  ThreadId,
  type OrchestrationV2AppThread,
  type OrchestrationV2AppThreadLineage,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ServerCommand,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "../orchestration-v2/Adapters/CodexAdapterV2.ts";
import * as EffectOutbox from "../orchestration-v2/EffectOutbox.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProviderAdapterRegistry from "../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "../orchestration-v2/testkit/ProviderReplayHarness.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as ChildStatusReactor from "./ChildStatusReactor.ts";

const instanceId = ProviderInstanceId.make("codex");
const modelSelection = { instanceId, model: "gpt-5.1-codex" };
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("No provider process needed for status commands"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
const layerDatabase = SqlitePersistence.layerMemory;
const layerTest = ChildStatusReactor.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      layerDatabase,
      ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
      EffectOutbox.layer.pipe(Layer.provide(layerDatabase)),
      ProviderReplayHarness.layerWithRegistry(
        { name: "fork-child-status" },
        ProviderAdapterRegistry.layerFromAdapters([adapter]),
        { databaseLayer: layerDatabase, runEffectWorker: false },
      ),
    ),
  ),
);

const parentId = ThreadId.make("thread:parent");
const rootLineage = { rootThreadId: parentId, parentThreadId: parentId };

const setup = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const reactor = yield* ChildStatusReactor.ChildStatusReactor;

  const createThread = Effect.fnUntraced(function* (
    threadId: ThreadId,
    lineage: OrchestrationV2AppThreadLineage | null,
  ) {
    yield* orchestrator.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`create:${threadId}`),
      threadId,
      projectId: ProjectId.make("project:fork-child-status"),
      title: threadId,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdBy: "user",
      creationSource: "web",
    });
    if (lineage === null) return;
    const thread = yield* projections.getThread(threadId);
    yield* projections.apply({
      id: EventId.make(`lineage:${threadId}`),
      type: "thread.metadata-updated",
      threadId,
      occurredAt: thread.updatedAt,
      payload: { ...thread, lineage },
    });
  });

  const run = Effect.fnUntraced(function* (command: OrchestrationV2ServerCommand) {
    const result = yield* orchestrator.dispatch(command);
    for (const stored of result.storedEvents) yield* reactor.handle(stored.event);
  });

  const status = Effect.fnUntraced(function* (threadId: ThreadId) {
    const thread = yield* projections.getThread(threadId);
    return {
      settledOverride: thread.settledOverride,
      snoozedUntil: thread.snoozedUntil == null ? null : DateTime.formatIso(thread.snoozedUntil),
    };
  });

  const announce = (thread: OrchestrationV2AppThread): OrchestrationV2DomainEvent => ({
    id: EventId.make(`announce:${thread.id}`),
    type: "thread.settled",
    threadId: thread.id,
    occurredAt: thread.updatedAt,
    payload: thread,
  });

  return { createThread, run, status, announce, projections, reactor };
});

it.effect("nested children follow every Settle and Snooze change of the parent", () =>
  Effect.gen(function* () {
    const { createThread, run, status } = yield* setup;
    const delegated = ThreadId.make("thread:delegated");
    const hidden = ThreadId.make("thread:hidden");
    const fork = ThreadId.make("thread:fork");
    const sideChat = ThreadId.make("thread:side-chat");
    const detached = ThreadId.make("thread:detached");
    yield* createThread(parentId, null);
    yield* createThread(delegated, {
      ...rootLineage,
      relationshipToParent: "subagent",
      listed: true,
    });
    yield* createThread(hidden, { ...rootLineage, relationshipToParent: "subagent" });
    yield* createThread(fork, { ...rootLineage, relationshipToParent: "fork" });
    yield* createThread(sideChat, {
      ...rootLineage,
      relationshipToParent: "fork",
      sideChat: true,
    });
    yield* createThread(detached, {
      ...rootLineage,
      relationshipToParent: "subagent",
      listed: true,
      detached: true,
    });
    const followers = [delegated, hidden, fork];
    const ignored = [sideChat, detached];
    const now = yield* DateTime.now;
    const snoozedUntil = DateTime.formatIso(DateTime.add(now, { hours: 2 }));
    const parentStatus = () => status(parentId);

    for (const [index, command] of [
      { type: "thread.settle" as const },
      { type: "thread.snooze" as const, snoozedUntil },
      { type: "thread.unsnooze" as const, reason: "user" as const },
      { type: "thread.unsettle" as const, reason: "user" as const },
      { type: "thread.snooze" as const, snoozedUntil },
      { type: "thread.unsnooze" as const, reason: "user" as const },
    ].entries()) {
      yield* run({
        ...command,
        commandId: CommandId.make(`parent:${index}:${command.type}`),
        threadId: parentId,
      });
      const expected = yield* parentStatus();
      for (const child of followers) {
        assert.deepEqual(yield* status(child), expected, `${child} after ${command.type}`);
      }
      for (const child of ignored) {
        assert.deepEqual(
          yield* status(child),
          { settledOverride: null, snoozedUntil: null },
          `${child} after ${command.type}`,
        );
      }
    }
  }).pipe(Effect.provide(layerTest)),
);

it.effect("a grandchild follows when its parent child follows", () =>
  Effect.gen(function* () {
    const { createThread, run, status, announce, projections, reactor } = yield* setup;
    const child = ThreadId.make("thread:child");
    const grandchild = ThreadId.make("thread:grandchild");
    yield* createThread(parentId, null);
    yield* createThread(child, { ...rootLineage, relationshipToParent: "subagent", listed: true });
    yield* createThread(grandchild, {
      rootThreadId: parentId,
      parentThreadId: child,
      relationshipToParent: "subagent",
      listed: true,
    });
    yield* run({
      type: "thread.settle",
      commandId: CommandId.make("settle-root"),
      threadId: parentId,
    });
    yield* reactor.handle(announce(yield* projections.getThread(child)));
    assert.equal((yield* status(grandchild)).settledOverride, "settled");
  }).pipe(Effect.provide(layerTest)),
);

it.effect("a busy child settles when its run ends while the parent is still settled", () =>
  Effect.gen(function* () {
    const { createThread, run, status, projections, reactor } = yield* setup;
    const child = ThreadId.make("thread:busy-child");
    yield* createThread(parentId, null);
    yield* createThread(child, { ...rootLineage, relationshipToParent: "subagent", listed: true });
    const now = yield* DateTime.now;
    const approval = {
      id: RuntimeRequestId.make("approval"),
      nodeId: NodeId.make("node:approval"),
      providerTurnId: null,
      nativeRequestRef: null,
      kind: "command" as const,
      status: "pending" as const,
      responseCapability: { type: "not_resumable" as const, reason: "test" },
      createdAt: now,
      resolvedAt: null,
    };
    yield* projections.apply({
      id: EventId.make("approval:pending"),
      type: "runtime-request.updated",
      threadId: child,
      occurredAt: now,
      payload: approval,
    });
    yield* run({
      type: "thread.settle",
      commandId: CommandId.make("settle-busy"),
      threadId: parentId,
    });
    assert.isNull((yield* status(child)).settledOverride);

    yield* projections.apply({
      id: EventId.make("approval:resolved"),
      type: "runtime-request.updated",
      threadId: child,
      occurredAt: now,
      payload: { ...approval, status: "resolved", resolvedAt: now },
    });
    yield* reactor.handle({
      id: EventId.make("run:completed"),
      type: "run.updated",
      threadId: child,
      occurredAt: now,
      payload: { status: "completed" },
    } as unknown as OrchestrationV2DomainEvent);
    assert.equal((yield* status(child)).settledOverride, "settled");
  }).pipe(Effect.provide(layerTest)),
);
