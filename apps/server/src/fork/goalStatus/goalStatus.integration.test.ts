import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ProviderGoal,
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
import * as GoalStallReactor from "./GoalStallReactor.ts";
import * as GoalStatus from "./GoalStatus.ts";
import { GOAL_CLEAR_TEXT } from "./goalStatusRules.ts";

const instanceId = ProviderInstanceId.make("claudeAgent");
const modelSelection = { instanceId, model: "claude-haiku-5-5" };
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("claudeAgent"),
  getCapabilities: () => Effect.succeed(ClaudeProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("Runs here never reach a provider"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
const layerDatabase = SqlitePersistence.layerMemory;
const layerTest = GoalStallReactor.layer.pipe(
  Layer.provideMerge(GoalStatus.layer),
  Layer.provideMerge(
    Layer.mergeAll(
      layerDatabase,
      ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
      EffectOutbox.layer.pipe(Layer.provide(layerDatabase)),
      ProviderReplayHarness.layerWithRegistry(
        { name: "goal-status" },
        ProviderAdapterRegistry.layerFromAdapters([adapter]),
        { databaseLayer: layerDatabase, runEffectWorker: false },
      ),
    ),
  ),
);

const OBJECTIVE = "The release is published for Linux and Mac";
const threadId = ThreadId.make("thread:goal-status");

const startGoalRun = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  yield* orchestrator.dispatch({
    type: "thread.create",
    commandId: CommandId.make("create-goal-thread"),
    threadId,
    projectId: ProjectId.make("project:goal-status"),
    title: "Release",
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
    commandId: CommandId.make("start-goal"),
    threadId,
    messageId: MessageId.make("message:start-goal"),
    text: `/goal ${OBJECTIVE}`,
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
        id: EventId.make("event:goal-run-running"),
        type: "run.updated",
        threadId,
        runId: started.id,
        occurredAt: now,
        payload: { ...started, status: "running", startedAt: now },
      },
    ],
  });
  return { run: started };
});

const goalUpdated = Effect.fn("test.goalUpdated")(function* (
  name: string,
  goal: OrchestrationV2ProviderGoal | null,
) {
  const sink = yield* EventSink.EventSinkV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const { providerThreads } = yield* projections.getThreadRecords(threadId, ["providerThreads"]);
  const event = {
    id: EventId.make(`event:provider-thread:${name}`),
    type: "provider-thread.updated",
    threadId,
    occurredAt: yield* DateTime.now,
    payload: { ...providerThreads[0]!, goal },
  } satisfies OrchestrationV2DomainEvent;
  yield* sink.write({ events: [event] });
  return event;
});

const activeGoal = (checks: number): OrchestrationV2ProviderGoal => ({
  objective: OBJECTIVE,
  status: "active",
  checks,
});

const goalState = Effect.gen(function* () {
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const { thread, runs, messages, turnItems } = yield* projections.getThreadRecords(threadId, [
    "runs",
    "messages",
    "turnItems",
  ]);
  const textOf = (messageId: string) => messages.find((message) => message.id === messageId)?.text;
  return {
    attention: thread.forkAttention ?? null,
    shellAttention: (yield* projections.getThreadShell(threadId))?.forkAttention ?? null,
    queued: runs
      .filter((run) => run.status === "queued")
      .toSorted((left, right) => (left.queuePosition ?? 0) - (right.queuePosition ?? 0))
      .map((run) => textOf(run.userMessageId)),
    stopped: turnItems
      .filter((item) => item.type === "run_interrupt_request")
      .map((item) => item.runId),
  };
});

it.effect("t3_goal_update clears the goal, stops the turn and keeps the reason", () =>
  Effect.gen(function* () {
    const goals = yield* GoalStatus.GoalStatus;
    const { run } = yield* startGoalRun;
    yield* goalUpdated("active", activeGoal(2));

    const attention = yield* goals.update({
      commandId: CommandId.make("mcp:goal-update"),
      threadId,
      status: "needs_user",
      reason: "Send the Mac login password to sign the Mac release",
      result: undefined,
    });

    const expected = {
      status: "needs_user",
      reason: "Send the Mac login password to sign the Mac release",
      goal: OBJECTIVE,
    } as const;
    assert.deepEqual(attention, expected);
    assert.deepEqual(yield* goalState, {
      attention: expected,
      shellAttention: expected,
      queued: [GOAL_CLEAR_TEXT],
      stopped: [run.id],
    });
  }).pipe(Effect.provide(layerTest)),
);

it.effect("t3_goal_update done keeps the result link for the card", () =>
  Effect.gen(function* () {
    const goals = yield* GoalStatus.GoalStatus;
    yield* startGoalRun;
    yield* goalUpdated("active", activeGoal(0));

    yield* goals.update({
      commandId: CommandId.make("mcp:goal-done"),
      threadId,
      status: "done",
      reason: "Both releases are published",
      result: "https://github.com/acme/app/releases/tag/v1.2.0",
    });

    assert.deepEqual((yield* goalState).attention, {
      status: "done",
      reason: "Both releases are published",
      goal: OBJECTIVE,
      result: "https://github.com/acme/app/releases/tag/v1.2.0",
    });
  }).pipe(Effect.provide(layerTest)),
);

it.effect("t3_goal_update refuses a thread without a goal", () =>
  Effect.gen(function* () {
    const goals = yield* GoalStatus.GoalStatus;
    yield* startGoalRun;

    const failure = yield* goals
      .update({
        commandId: CommandId.make("mcp:no-goal"),
        threadId,
        status: "blocked",
        reason: "CI runs out of memory",
        result: undefined,
      })
      .pipe(Effect.flip);

    assert.include(failure.detail, "no goal");
    assert.deepEqual((yield* goalState).queued, []);
  }).pipe(Effect.provide(layerTest)),
);

const assistantSaid = Effect.fn("test.assistantSaid")(function* (name: string, text: string) {
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const { runs } = yield* projections.getThreadRecords(threadId, ["runs"]);
  const run = runs[0]!;
  const now = yield* DateTime.now;
  return {
    id: EventId.make(`event:assistant:${name}`),
    type: "message.updated",
    threadId,
    runId: run.id,
    occurredAt: now,
    payload: {
      id: MessageId.make(`message:assistant:${name}`),
      threadId,
      runId: run.id,
      nodeId: run.rootNodeId,
      role: "assistant",
      text,
      attachments: [],
      streaming: false,
      createdBy: "agent",
      creationSource: "provider",
      createdAt: now,
      updatedAt: now,
    },
  } satisfies OrchestrationV2DomainEvent;
});

const toolRan = Effect.fn("test.toolRan")(function* (name: string) {
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const { runs } = yield* projections.getThreadRecords(threadId, ["runs"]);
  const run = runs[0]!;
  const now = yield* DateTime.now;
  return {
    id: EventId.make(`event:tool:${name}`),
    type: "turn-item.updated",
    threadId,
    runId: run.id,
    occurredAt: now,
    payload: {
      id: TurnItemId.make(`turn-item:tool:${name}`),
      threadId,
      runId: run.id,
      nodeId: run.rootNodeId,
      providerThreadId: run.providerThreadId,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal: 1,
      status: "completed",
      title: null,
      startedAt: now,
      completedAt: now,
      updatedAt: now,
      type: "dynamic_tool",
      toolName: "Bash",
      input: { command: "gh run watch" },
    },
  } satisfies OrchestrationV2DomainEvent;
});

it.effect.each([
  {
    name: "a turn that ends on a question pauses at the first block",
    turns: [["work", "say:PR #57 is green. Should I merge it?", "block"]],
    reason: "PR #57 is green. Should I merge it?",
  },
  {
    name: "a second block with no work between pauses",
    turns: [
      ["work", "say:Fork CI is green.", "block"],
      [
        "say:## PRECISO DE VOCÊ\nRode `/goal clear`: o release do Mac precisa da sua senha.",
        "block",
      ],
    ],
    reason: "Rode /goal clear: o release do Mac precisa da sua senha.",
  },
  {
    name: "a question before more work is not the end of the turn",
    turns: [["say:Does the build pass?", "work", "block"]],
    reason: null,
  },
  {
    name: "work between blocks keeps the goal going",
    turns: [
      ["work", "say:Fork CI is green.", "block"],
      ["work", "say:The Linux build passed.", "block"],
    ],
    reason: null,
  },
] as const)("the Stop hook loop: $name", ({ turns, reason }) =>
  Effect.gen(function* () {
    const reactor = yield* GoalStallReactor.GoalStallReactor;
    yield* startGoalRun;
    yield* reactor.handle(yield* goalUpdated("set", activeGoal(0)));
    for (const [turn, steps] of turns.entries()) {
      for (const [index, step] of steps.entries()) {
        const name = `${turn}-${index}`;
        if (step === "work") yield* reactor.handle(yield* toolRan(name));
        else if (step === "block") {
          yield* reactor.handle(yield* goalUpdated(name, activeGoal(turn + 1)));
        } else yield* reactor.handle(yield* assistantSaid(name, step.slice("say:".length)));
      }
    }

    const state = yield* goalState;
    assert.deepEqual(
      state.attention,
      reason === null ? null : { status: "needs_user", reason, goal: OBJECTIVE },
    );
    assert.deepEqual(state.queued, reason === null ? [] : [GOAL_CLEAR_TEXT]);
  }).pipe(Effect.provide(layerTest)),
);

const userSends = Effect.fn("test.userSends")(function* (name: string, text: string) {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const { runs } = yield* projections.getThreadRecords(threadId, ["runs"]);
  yield* orchestrator.dispatch({
    type: "message.dispatch",
    commandId: CommandId.make(`command:${name}`),
    threadId,
    messageId: MessageId.make(`message:${name}`),
    text,
    attachments: [],
    dispatchMode: { type: "steer_active", targetRunId: runs[0]!.id },
    deliveryIntent: "steer",
    createdBy: "user",
    creationSource: "web",
  });
});

it.effect("the owner's question pauses the goal, and the agent answers it first", () =>
  Effect.gen(function* () {
    const { run } = yield* startGoalRun;
    yield* goalUpdated("active", activeGoal(1));

    yield* userSends("question", "esses checks rodam no CI?");

    assert.deepEqual(yield* goalState, {
      attention: { status: "question", reason: "esses checks rodam no CI?", goal: OBJECTIVE },
      shellAttention: { status: "question", reason: "esses checks rodam no CI?", goal: OBJECTIVE },
      queued: [GOAL_CLEAR_TEXT, "esses checks rodam no CI?"],
      stopped: [run.id],
    });
  }).pipe(Effect.provide(layerTest)),
);

it.effect("a steer that asks nothing leaves the goal running", () =>
  Effect.gen(function* () {
    yield* startGoalRun;
    yield* goalUpdated("active", activeGoal(1));

    yield* userSends("statement", "use o runner maior");

    const state = yield* goalState;
    assert.deepEqual([state.attention, state.stopped], [null, []]);
    assert.notInclude(state.queued, GOAL_CLEAR_TEXT);
  }).pipe(Effect.provide(layerTest)),
);

it.effect("the owner's answer turns Needs you into a paused goal", () =>
  Effect.gen(function* () {
    const goals = yield* GoalStatus.GoalStatus;
    yield* startGoalRun;
    yield* goalUpdated("active", activeGoal(1));
    yield* goals.update({
      commandId: CommandId.make("mcp:needs-you"),
      threadId,
      status: "needs_user",
      reason: "Approve the production deploy",
      result: undefined,
    });
    yield* goalUpdated("cleared", null);

    yield* userSends("answer", "aprovado, pode subir");

    assert.deepEqual((yield* goalState).attention, { status: "paused", goal: OBJECTIVE });
  }).pipe(Effect.provide(layerTest)),
);

it.effect("the judge's verdict turns the goal card into Done without a /goal clear", () =>
  Effect.gen(function* () {
    const reactor = yield* GoalStallReactor.GoalStallReactor;
    yield* startGoalRun;
    yield* reactor.handle(yield* goalUpdated("active", activeGoal(0)));

    yield* reactor.handle(
      yield* goalUpdated("complete", { objective: OBJECTIVE, status: "complete", checks: 1 }),
    );

    const state = yield* goalState;
    assert.deepEqual([state.attention, state.queued], [{ status: "done", goal: OBJECTIVE }, []]);
  }).pipe(Effect.provide(layerTest)),
);

const SUMMARY = "Send the Mac login password to sign the Mac release";

it.effect("t3_request_attention marks Needs you, and the owner's reply clears it", () =>
  Effect.gen(function* () {
    const goals = yield* GoalStatus.GoalStatus;
    yield* startGoalRun;

    const outcome = yield* goals.request({
      commandId: CommandId.make("mcp:request-attention"),
      threadId,
      summary: SUMMARY,
    });

    const expected = { status: "needs_user", reason: SUMMARY } as const;
    const state = yield* goalState;
    assert.equal(outcome, "thread");
    assert.deepEqual(
      [state.attention, state.shellAttention, state.stopped],
      [expected, expected, []],
    );

    yield* userSends("reply", "mandei a senha");

    const cleared = yield* goalState;
    assert.deepEqual([cleared.attention, cleared.shellAttention], [null, null]);
  }).pipe(Effect.provide(layerTest)),
);

it.effect("t3_request_attention in an active goal pauses it like t3_goal_update", () =>
  Effect.gen(function* () {
    const goals = yield* GoalStatus.GoalStatus;
    const { run } = yield* startGoalRun;
    yield* goalUpdated("active", activeGoal(1));

    const outcome = yield* goals.request({
      commandId: CommandId.make("mcp:request-in-goal"),
      threadId,
      summary: SUMMARY,
    });

    const state = yield* goalState;
    assert.equal(outcome, "goal");
    assert.deepEqual(state.attention, { status: "needs_user", reason: SUMMARY, goal: OBJECTIVE });
    assert.deepEqual([state.queued, state.stopped], [[GOAL_CLEAR_TEXT], [run.id]]);
  }).pipe(Effect.provide(layerTest)),
);

const delegateChild = Effect.fn("test.delegateChild")(function* (listed: boolean) {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const { run } = yield* startGoalRun;
  yield* orchestrator.dispatch({
    type: "delegated_task.request",
    commandId: CommandId.make("delegate-release-mac"),
    parentThreadId: threadId,
    parentRunId: run.id,
    parentNodeId: run.rootNodeId!,
    task: "Build and sign the Mac release.",
    title: "Mac release",
    completionWake: "always",
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    createdBy: "agent",
    creationSource: "mcp",
    listed,
  });
  const task = (yield* projections.getThreadProjection(threadId)).subagents[0]!;
  return { task, childThreadId: task.childThreadId! };
});

const parentWakes = Effect.gen(function* () {
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const { messages } = yield* projections.getThreadRecords(threadId, ["messages"]);
  return messages
    .filter((message) => message.notification !== undefined)
    .map((message) => ({ text: message.text, summary: message.notification?.summary }));
});

const childAttention = Effect.fn("test.childAttention")(function* (childThreadId: ThreadId) {
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  return (yield* projections.getThread(childThreadId)).forkAttention ?? null;
});

it.effect("a hidden child's request reaches its parent, and the parent's reply clears it", () =>
  Effect.gen(function* () {
    const goals = yield* GoalStatus.GoalStatus;
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const { task, childThreadId } = yield* delegateChild(false);

    const outcome = yield* goals.request({
      commandId: CommandId.make("mcp:child-request"),
      threadId: childThreadId,
      summary: SUMMARY,
    });

    assert.equal(outcome, "parent");
    assert.deepEqual(yield* childAttention(childThreadId), {
      status: "needs_user",
      reason: SUMMARY,
    });
    const [wake] = yield* parentWakes;
    assert.equal(wake?.summary, 'Delegated task "Mac release" needs the user');
    assert.include(wake?.text, `Delegated task ${task.id} needs the user: ${SUMMARY}`);
    assert.include(wake?.text, `t3_thread_send to threadId ${childThreadId}`);

    yield* orchestrator.dispatch({
      type: "message.dispatch",
      commandId: CommandId.make("parent-reply"),
      threadId: childThreadId,
      messageId: MessageId.make("message:parent-reply"),
      senderThreadId: threadId,
      text: "The password is in the vault entry Mac login.",
      attachments: [],
      dispatchMode: { type: "queue_after_active" },
      createdBy: "agent",
      creationSource: "mcp",
    });

    assert.isNull(yield* childAttention(childThreadId));
  }).pipe(Effect.provide(layerTest)),
);

it.effect("a listed child's request stays on its own row", () =>
  Effect.gen(function* () {
    const goals = yield* GoalStatus.GoalStatus;
    const { childThreadId } = yield* delegateChild(true);

    const outcome = yield* goals.request({
      commandId: CommandId.make("mcp:listed-child-request"),
      threadId: childThreadId,
      summary: SUMMARY,
    });

    assert.equal(outcome, "thread");
    assert.deepEqual(yield* childAttention(childThreadId), {
      status: "needs_user",
      reason: SUMMARY,
    });
    assert.deepEqual(yield* parentWakes, []);
  }).pipe(Effect.provide(layerTest)),
);
