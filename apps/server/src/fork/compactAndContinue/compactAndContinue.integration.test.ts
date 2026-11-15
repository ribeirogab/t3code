import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ClaudeProviderCapabilitiesV2 } from "../../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import * as EffectOutbox from "../../orchestration-v2/EffectOutbox.ts";
import * as EventSink from "../../orchestration-v2/EventSink.ts";
import * as Orchestrator from "../../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../../orchestration-v2/ProjectionStore.ts";
import * as ProviderAdapterRegistry from "../../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "../../orchestration-v2/testkit/ProviderReplayHarness.ts";
import * as SqlitePersistence from "../../persistence/Sqlite.ts";
import * as CompactAndContinue from "./CompactAndContinue.ts";

const instanceId = ProviderInstanceId.make("claudeAgent");
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("claudeAgent"),
  getCapabilities: () => Effect.succeed(ClaudeProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("Runs here never reach a provider"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
const layerDatabase = SqlitePersistence.layerMemory;
const layerTest = CompactAndContinue.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      layerDatabase,
      ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
      EffectOutbox.layer.pipe(Layer.provide(layerDatabase)),
      ProviderReplayHarness.layerWithRegistry(
        { name: "compact-and-continue" },
        ProviderAdapterRegistry.layerFromAdapters([adapter]),
        { databaseLayer: layerDatabase, runEffectWorker: false },
      ),
    ),
  ),
);

const threadId = ThreadId.make("thread:compact-and-continue");

const startRunningTurn = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  yield* orchestrator.dispatch({
    type: "thread.create",
    commandId: CommandId.make("create-thread"),
    threadId,
    projectId: ProjectId.make("project:compact-and-continue"),
    title: "Migration plan",
    modelSelection: { instanceId, model: "claude-haiku-5-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    createdBy: "user",
    creationSource: "web",
  });
  yield* orchestrator.dispatch({
    type: "message.dispatch",
    commandId: CommandId.make("start-turn"),
    threadId,
    messageId: MessageId.make("message:start-turn"),
    text: "Write the migration plan, then compact and continue with its goal.",
    attachments: [],
    dispatchMode: { type: "start_immediately" },
    createdBy: "user",
    creationSource: "web",
  });
  const started = (yield* projections.getThreadProjection(threadId)).runs[0]!;
  const now = yield* DateTime.now;
  const sink = yield* EventSink.EventSinkV2;
  yield* sink.write({
    events: [
      {
        id: EventId.make("event:turn-running"),
        type: "run.updated",
        threadId,
        runId: started.id,
        occurredAt: now,
        payload: { ...started, status: "running", startedAt: now },
      },
    ],
  });
  return started;
});

const threadQueue = Effect.gen(function* () {
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const { runs, messages } = yield* projections.getThreadRecords(threadId, ["runs", "messages"]);
  const messageOf = (messageId: string) => messages.find((message) => message.id === messageId);
  return {
    statuses: runs.map((run) => run.status),
    queued: runs
      .filter((run) => run.status === "queued")
      .toSorted((left, right) => (left.queuePosition ?? 0) - (right.queuePosition ?? 0))
      .map((run) => {
        const message = messageOf(run.userMessageId);
        return { text: message?.text, createdBy: message?.createdBy };
      }),
  };
});

it.effect("queues /compact, then the message, then the goal, behind the running turn", () =>
  Effect.gen(function* () {
    const compaction = yield* CompactAndContinue.CompactAndContinue;
    yield* startRunningTurn;

    const queued = yield* compaction.queue({
      commandId: CommandId.make("mcp:compact-and-continue"),
      threadId,
      message: "Continue with wave 2 of PLAN.md.",
      goal: "Wave 2 is merged into main and deployed to staging",
    });

    const texts = [
      "/compact",
      "Continue with wave 2 of PLAN.md.",
      "/goal Wave 2 is merged into main and deployed to staging",
    ];
    assert.deepEqual(queued, texts);
    assert.deepEqual(yield* threadQueue, {
      statuses: ["running", "queued", "queued", "queued"],
      queued: texts.map((text) => ({ text, createdBy: "agent" as const })),
    });
  }).pipe(Effect.provide(layerTest)),
);

it.effect("queues only /compact and the goal when there is no message", () =>
  Effect.gen(function* () {
    const compaction = yield* CompactAndContinue.CompactAndContinue;
    yield* startRunningTurn;

    yield* compaction.queue({
      commandId: CommandId.make("mcp:compact-goal"),
      threadId,
      message: undefined,
      goal: "The release is published",
    });

    assert.deepEqual(
      (yield* threadQueue).queued.map((entry) => entry.text),
      ["/compact", "/goal The release is published"],
    );
  }).pipe(Effect.provide(layerTest)),
);

it.effect("queues nothing without a message or a goal", () =>
  Effect.gen(function* () {
    const compaction = yield* CompactAndContinue.CompactAndContinue;
    yield* startRunningTurn;

    const failure = yield* compaction
      .queue({
        commandId: CommandId.make("mcp:compact-nothing"),
        threadId,
        message: undefined,
        goal: undefined,
      })
      .pipe(Effect.flip);

    assert.include(failure.detail, "`message`, `goal`, or both");
    assert.deepEqual((yield* threadQueue).queued, []);
  }).pipe(Effect.provide(layerTest)),
);
