import { assert, describe, it } from "@effect/vitest";
import {
  EventId,
  NodeId,
  PlanId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2PlanStep,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { forkPlanProgressFromSteps, forkPlanProgressFromStepsJson } from "./planProgress.ts";

const step = (
  id: string,
  status: OrchestrationV2PlanStep["status"],
  text = `Step ${id}`,
): OrchestrationV2PlanStep => ({ id, text, status });

describe("forkPlanProgressFromSteps", () => {
  it("counts completed steps and names the running step as next", () => {
    assert.deepStrictEqual(
      forkPlanProgressFromSteps([
        step("1", "completed"),
        step("2", "pending"),
        step("3", "running"),
      ]),
      { done: 1, total: 3, next: "Step 3" },
    );
  });

  it("names the first pending step when no step runs", () => {
    assert.deepStrictEqual(
      forkPlanProgressFromSteps([
        step("1", "completed"),
        step("2", "pending"),
        step("3", "pending"),
      ]),
      { done: 1, total: 3, next: "Step 2" },
    );
  });

  it("has no next step when every step is done", () => {
    assert.deepStrictEqual(
      forkPlanProgressFromSteps([step("1", "completed"), step("2", "completed")]),
      { done: 2, total: 2, next: null },
    );
  });

  it("has no progress for an empty plan", () => {
    assert.isNull(forkPlanProgressFromSteps([]));
  });

  it("cuts a long next step", () => {
    const progress = forkPlanProgressFromSteps([step("1", "pending", "x".repeat(500))]);
    assert.strictEqual(progress?.next?.length, 200);
  });
});

describe("forkPlanProgressFromStepsJson", () => {
  it("reads the stored steps", () => {
    assert.deepStrictEqual(
      forkPlanProgressFromStepsJson(JSON.stringify([step("1", "completed"), step("2", "pending")])),
      { done: 1, total: 2, next: "Step 2" },
    );
  });

  it("has no progress without a todo list or with unreadable steps", () => {
    assert.isNull(forkPlanProgressFromStepsJson(null));
    assert.isNull(forkPlanProgressFromStepsJson("{broken"));
    assert.isNull(forkPlanProgressFromStepsJson(JSON.stringify([{ text: "a", status: "odd" }])));
  });
});

const layerTest = Layer.mergeAll(
  ProjectionStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory)),
  SqlitePersistence.layerMemory,
);

const applyTodoList = (input: {
  readonly threadId: ThreadId;
  readonly planId: string;
  readonly status: "active" | "completed" | "superseded";
  readonly steps: ReadonlyArray<OrchestrationV2PlanStep>;
}) =>
  Effect.gen(function* () {
    const store = yield* ProjectionStore.ProjectionStoreV2;
    const nodeId = NodeId.make(`node:${input.planId}`);
    yield* store.apply({
      id: EventId.make(`event:${input.planId}:${input.status}`),
      type: "plan.updated",
      threadId: input.threadId,
      nodeId,
      occurredAt: yield* DateTime.now,
      payload: {
        id: PlanId.make(input.planId),
        threadId: input.threadId,
        runId: null,
        nodeId,
        status: input.status,
        kind: "todo_list",
        steps: input.steps,
      },
    });
  });

it.layer(layerTest)("thread shell plan progress", (it) => {
  it.effect("follows the latest todo list that is not superseded", () =>
    Effect.gen(function* () {
      const store = yield* ProjectionStore.ProjectionStoreV2;
      const now = yield* DateTime.now;
      const threadId = ThreadId.make("thread:plan-progress");
      yield* store.apply({
        id: EventId.make("event:plan-progress:created"),
        type: "thread.created",
        threadId,
        occurredAt: now,
        payload: {
          createdBy: "user",
          creationSource: "web",
          id: threadId,
          projectId: ProjectId.make("project:plan-progress"),
          title: "Plan progress",
          providerInstanceId: ProviderInstanceId.make("claude"),
          modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "haiku" },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          activeProviderThreadId: null,
          lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
          forkedFrom: null,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
          settledOverride: null,
          settledAt: null,
          lastVisitedAt: null,
          deletedAt: null,
        },
      });
      assert.isNull((yield* store.getThreadShell(threadId))?.forkPlanProgress ?? null);

      yield* applyTodoList({
        threadId,
        planId: "plan:first",
        status: "active",
        steps: [step("1", "running"), step("2", "pending")],
      });
      yield* applyTodoList({
        threadId,
        planId: "plan:second",
        status: "active",
        steps: [step("1", "completed"), step("2", "running", "Write tests"), step("3", "pending")],
      });
      const expected = { done: 1, total: 3, next: "Write tests" };
      assert.deepStrictEqual((yield* store.getThreadShell(threadId))?.forkPlanProgress, expected);

      yield* applyTodoList({
        threadId,
        planId: "plan:first",
        status: "superseded",
        steps: [step("1", "running"), step("2", "pending")],
      });

      assert.deepStrictEqual((yield* store.getThreadShell(threadId))?.forkPlanProgress, expected);
      const snapshot = yield* store.getShellSnapshot();
      assert.deepStrictEqual(
        snapshot.threads.find((thread) => thread.id === threadId)?.forkPlanProgress,
        expected,
      );
    }),
  );
});
