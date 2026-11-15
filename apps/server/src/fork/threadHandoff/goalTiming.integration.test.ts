import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeRequestId,
  ThreadId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2Run,
} from "@t3tools/contracts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";

import { CodexProviderCapabilitiesV2 } from "../../orchestration-v2/Adapters/CodexAdapterV2.ts";
import * as DelegatedTaskQuestionReactor from "../../orchestration-v2/DelegatedTaskQuestionReactor.ts";
import * as EffectOutbox from "../../orchestration-v2/EffectOutbox.ts";
import * as EventSink from "../../orchestration-v2/EventSink.ts";
import * as Orchestrator from "../../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../../orchestration-v2/ProjectionStore.ts";
import * as ProviderAdapterRegistry from "../../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "../../orchestration-v2/testkit/ProviderReplayHarness.ts";
import * as SqlitePersistence from "../../persistence/Sqlite.ts";
import { goalCommandText } from "./handoffRules.ts";
import { GOAL_MET_LINE, queuedGoalId } from "./goalTiming.ts";

const instanceId = ProviderInstanceId.make("codex");
const modelSelection = { instanceId, model: "gpt-5.1-codex" };
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("Runs here never reach a provider"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
const layerDatabase = SqlitePersistence.layerMemory;
const layerTest = DelegatedTaskQuestionReactor.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      layerDatabase,
      ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
      EffectOutbox.layer.pipe(Layer.provide(layerDatabase)),
      ProviderReplayHarness.layerWithRegistry(
        { name: "goal-timing" },
        ProviderAdapterRegistry.layerFromAdapters([adapter]),
        { databaseLayer: layerDatabase, runEffectWorker: false },
      ),
    ),
  ),
);

it.effect.each([
  { answer: "The fix is in.", goalRunStatus: "starting" },
  { answer: `The fix is in.\n\n${GOAL_MET_LINE}`, goalRunStatus: "cancelled" },
] as const)(
  "a child's /goal waits for the parent's answer, then $goalRunStatus",
  ({ answer, goalRunStatus }) =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const sink = yield* EventSink.EventSinkV2;
      const reactor = yield* DelegatedTaskQuestionReactor.DelegatedTaskQuestionReactor;
      const now = yield* DateTime.now;
      const parentThreadId = ThreadId.make("thread:goal-parent");
      yield* orchestrator.dispatch({
        type: "thread.create",
        commandId: CommandId.make("create-goal-parent"),
        threadId: parentThreadId,
        projectId: ProjectId.make("project:goal-timing"),
        title: "Coordinator",
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdBy: "user",
        creationSource: "web",
      });
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make("start-goal-parent"),
        threadId: parentThreadId,
        messageId: MessageId.make("message:goal-parent"),
        text: "Delegate the fix",
        attachments: [],
        dispatchMode: { type: "start_immediately" },
        createdBy: "user",
        creationSource: "web",
      });
      const parentRun = (yield* projections.getThreadProjection(parentThreadId)).runs[0]!;
      const delegation = CommandId.make("delegate-goal-task");
      yield* orchestrator.dispatch({
        type: "delegated_task.request",
        commandId: delegation,
        parentThreadId,
        parentRunId: parentRun.id,
        parentNodeId: parentRun.rootNodeId!,
        task: "Fix the login bug. Send your questions first.",
        completionWake: "always",
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        createdBy: "agent",
        creationSource: "mcp",
      });
      const task = (yield* projections.getThreadProjection(parentThreadId)).subagents[0]!;
      const childThreadId = task.childThreadId!;
      const goalId = queuedGoalId(delegation);
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make(goalId),
        threadId: childThreadId,
        messageId: MessageId.make(goalId),
        senderThreadId: childThreadId,
        text: goalCommandText("The login test passes"),
        attachments: [],
        dispatchMode: { type: "queue_after_active" },
        createdBy: "agent",
        creationSource: "mcp",
      });
      const childRuns = () =>
        projections
          .getThreadRecords(childThreadId, ["runs"])
          .pipe(Effect.map(({ runs }) => runs.toSorted((a, b) => a.ordinal - b.ordinal)));
      const [firstRun, goalRun] = yield* childRuns();
      const finalQuestion = {
        id: EventId.make("event:final-question"),
        type: "runtime-request.updated",
        threadId: childThreadId,
        runId: firstRun!.id,
        occurredAt: now,
        payload: {
          id: RuntimeRequestId.make("request:final-question"),
          nodeId: firstRun!.rootNodeId!,
          providerTurnId: null,
          nativeRequestRef: null,
          kind: "user_input",
          status: "pending",
          responseCapability: { type: "message" },
          createdAt: now,
          resolvedAt: null,
        },
      } satisfies OrchestrationV2DomainEvent;
      const runEnded = (run: OrchestrationV2Run) =>
        ({
          id: EventId.make(`event:${run.id}:completed`),
          type: "run.updated",
          threadId: childThreadId,
          runId: run.id,
          occurredAt: now,
          payload: { ...run, status: "completed", startedAt: now, completedAt: now },
        }) satisfies OrchestrationV2DomainEvent;
      const nextGoalRunUpdate = (matches: (run: OrchestrationV2Run) => boolean) =>
        Effect.gen(function* () {
          const afterSequence = yield* sink.latestSequence();
          return sink.stream({ afterSequence, eventType: "run.updated" }).pipe(
            Stream.filterMap((stored) =>
              stored.event.type === "run.updated" &&
              stored.event.runId === goalRun!.id &&
              matches(stored.event.payload)
                ? Result.succeed(stored.event.payload)
                : Result.failVoid,
            ),
            Stream.runHead,
            Effect.map(Option.getOrUndefined),
          );
        });

      yield* sink.write({ events: [finalQuestion] });
      yield* reactor.handle(finalQuestion);
      const wake = (yield* projections.getThreadRecords(parentThreadId, [
        "messages",
      ])).messages.find((message) => message.notification !== undefined);
      assert.include(
        wake?.text,
        `t3_pending_request action read, threadId ${childThreadId}, and requestId ${finalQuestion.payload.id}.`,
      );

      const afterFirstTurn = yield* nextGoalRunUpdate(() => true);
      yield* sink.write({ events: [runEnded(firstRun!)] });
      const held = yield* afterFirstTurn;
      assert.deepEqual([held?.status, held?.queueHeld], ["queued", true]);

      const answered = {
        ...finalQuestion,
        id: EventId.make("event:final-question-answered"),
        payload: { ...finalQuestion.payload, status: "resolved" as const, resolvedAt: now },
      };
      yield* sink.write({ events: [answered] });
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make("parent-answer"),
        threadId: childThreadId,
        messageId: MessageId.make("message:parent-answer"),
        senderThreadId: parentThreadId,
        text: "Use the session cookie.",
        attachments: [],
        dispatchMode: { type: "queue_after_active" },
        createdBy: "agent",
        creationSource: "mcp",
      });
      const answerRun = (yield* childRuns()).find(
        (run) => run.userMessageId === "message:parent-answer",
      )!;
      assert.equal(answerRun.status, "starting");
      yield* sink.write({
        events: [
          {
            id: EventId.make("event:answer-reply"),
            type: "message.updated",
            threadId: childThreadId,
            runId: answerRun.id,
            occurredAt: now,
            payload: {
              id: MessageId.make("message:answer-reply"),
              threadId: childThreadId,
              runId: answerRun.id,
              nodeId: answerRun.rootNodeId,
              role: "assistant",
              text: answer,
              attachments: [],
              streaming: false,
              createdBy: "agent",
              creationSource: "provider",
              createdAt: now,
              updatedAt: now,
            },
          },
        ],
      });

      const afterAnswer = yield* nextGoalRunUpdate((run) => run.status !== "queued");
      yield* sink.write({ events: [runEnded(answerRun)] });
      assert.equal((yield* afterAnswer)?.status, goalRunStatus);
    }).pipe(Effect.provide(layerTest)),
);
