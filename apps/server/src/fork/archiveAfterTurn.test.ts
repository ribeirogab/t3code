import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  overrideForkFeatureSettings,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "../orchestration-v2/Adapters/CodexAdapterV2.ts";
import * as EventSink from "../orchestration-v2/EventSink.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProviderAdapterRegistry from "../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "../orchestration-v2/testkit/ProviderReplayHarness.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import { archiveAfterTurn } from "./archiveAfterTurn.ts";

const instanceId = ProviderInstanceId.make("codex");
const modelSelection = { instanceId, model: "gpt-5.1-codex" };
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("No provider process needed for archive commands"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
const layerTest = ProviderReplayHarness.layerWithRegistry(
  { name: "fork-archive-after-turn" },
  ProviderAdapterRegistry.layerFromAdapters([adapter]),
  { databaseLayer: SqlitePersistence.layerMemory, runEffectWorker: false },
);

const startThread = Effect.fnUntraced(function* (name: string, startTurn: boolean) {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const threadId = ThreadId.make(`thread:${name}`);
  yield* orchestrator.dispatch({
    type: "thread.create",
    commandId: CommandId.make(`create:${name}`),
    threadId,
    projectId: ProjectId.make("project:fork-archive-after-turn"),
    title: name,
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    createdBy: "user",
    creationSource: "web",
  });
  if (startTurn) {
    yield* orchestrator.dispatch({
      type: "message.dispatch",
      createdBy: "user",
      creationSource: "web",
      commandId: CommandId.make(`message:${name}`),
      threadId,
      messageId: MessageId.make(`message:${name}`),
      text: "Close the case.",
      attachments: [],
      modelSelection,
      dispatchMode: { type: "start_immediately" },
    });
  }
  return threadId;
});

const archiveRequest = (threadId: ThreadId) => ({
  threadId,
  commandId: CommandId.make(`archive:${threadId}`),
});

it.layer(layerTest)("archiveAfterTurn", (it) => {
  it.effect("archives a thread with a running turn once the turn ends", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const eventSink = yield* EventSink.EventSinkV2;
      const threadId = yield* startThread("running", true);
      const run = (yield* orchestrator.getThreadProjection(threadId)).runs[0];
      if (run === undefined) return yield* Effect.die(new Error("Run missing."));

      const archived = yield* orchestrator
        .streamStoredEventsFrom({ threadId, afterSequence: 0, eventType: "thread.archived" })
        .pipe(Stream.runHead, Effect.forkChild);
      const result = yield* archiveAfterTurn(orchestrator, "archive", archiveRequest(threadId));

      assert.deepStrictEqual(result, { archivesWhenTurnEnds: true });
      const during = yield* orchestrator.getThreadShell(threadId);
      assert.isNull(during?.archivedAt ?? null);
      assert.strictEqual(during?.activeRunId, run.id);

      const now = yield* DateTime.now;
      yield* eventSink.write({
        commandId: CommandId.make("run-completed:running"),
        events: [
          {
            id: EventId.make("run-completed:running"),
            type: "run.updated",
            threadId,
            runId: run.id,
            occurredAt: now,
            payload: { ...run, status: "completed", startedAt: now, completedAt: now },
          },
        ],
      });
      yield* Fiber.join(archived);

      assert.isNotNull((yield* orchestrator.getThreadShell(threadId))?.archivedAt ?? null);
    }),
  );

  it.effect("leaves the archive to the caller when it can apply at once", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const idle = yield* startThread("idle", false);
      const running = yield* startThread("running-unarchive", true);

      assert.isNull(yield* archiveAfterTurn(orchestrator, "archive", archiveRequest(idle)));
      assert.isNull(yield* archiveAfterTurn(orchestrator, "unarchive", archiveRequest(running)));
      {
        using _off = overrideForkFeatureSettings({ features: { archiveAfterTurn: false } });
        assert.isNull(yield* archiveAfterTurn(orchestrator, "archive", archiveRequest(running)));
      }
      using _master = overrideForkFeatureSettings({ master: false });
      assert.isNull(yield* archiveAfterTurn(orchestrator, "archive", archiveRequest(running)));
    }),
  );
});
