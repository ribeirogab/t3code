import { assert, describe, it } from "@effect/vitest";
import {
  EventId,
  NodeId,
  overrideForkFeatureSettings,
  ThreadId,
  type OrchestrationV2AppThread,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2Subagent,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { withForkToolGates } from "./forkToolGates.ts";
import { caseClosedDispatch, type CaseCloseReader } from "./ownerFacingTasks.ts";

const parentId = ThreadId.make("thread:hub");
const childId = ThreadId.make("thread:delegated-task:case-5");
const taskId = NodeId.make("node:delegated-task:case-5");

const thread = (overrides: Partial<OrchestrationV2AppThread>) =>
  ({
    id: parentId,
    title: "Support hub",
    lineage: { rootThreadId: parentId, parentThreadId: null, relationshipToParent: null },
    archivedAt: null,
    deletedAt: null,
    settledOverride: null,
    ...overrides,
  }) as OrchestrationV2AppThread;

const child = (overrides: Partial<OrchestrationV2AppThread> = {}) =>
  thread({
    id: childId,
    title: "Case #5",
    lineage: { rootThreadId: parentId, parentThreadId: parentId, relationshipToParent: "subagent" },
    ...overrides,
  });

const task = (overrides: Partial<OrchestrationV2Subagent> = {}) =>
  ({
    id: taskId,
    origin: "app_owned",
    childThreadId: childId,
    notifyParent: "on_close",
    ...overrides,
  }) as OrchestrationV2Subagent;

const event = (type: "thread.settled" | "thread.archived" | "thread.unsettled") =>
  ({ id: EventId.make(`event:${type}`), type, threadId: childId }) as OrchestrationV2DomainEvent;

const reader = (input: {
  readonly parent?: OrchestrationV2AppThread;
  readonly child: OrchestrationV2AppThread;
  readonly tasks?: ReadonlyArray<OrchestrationV2Subagent>;
}): CaseCloseReader => ({
  getThread: (threadId) =>
    Effect.succeed(threadId === childId ? input.child : (input.parent ?? thread({}))),
  getThreadRecords: () => Effect.succeed({ subagents: input.tasks ?? [task()] }),
});

describe("withForkToolGates on delegate_task", () => {
  it.effect("turns ownerFacing into a listed child that wakes the parent only on close", () =>
    Effect.gen(function* () {
      const seen: Array<unknown> = [];
      const gated = withForkToolGates({
        delegate_task: (params: object) => Effect.sync(() => seen.push(params)),
      });
      yield* gated.delegate_task({ task: "Case #5", ownerFacing: true, notifyParent: "on_finish" });
      yield* gated.delegate_task({ task: "Case #6", ownerFacing: false });
      {
        using _settings = overrideForkFeatureSettings({ features: { nestedThreads: false } });
        yield* gated.delegate_task({ task: "Case #7", ownerFacing: true });
      }
      {
        using _settings = overrideForkFeatureSettings({ features: { ownerFacingTasks: false } });
        yield* gated.delegate_task({ task: "Case #8", ownerFacing: true });
      }
      assert.deepEqual(seen, [
        { task: "Case #5", notifyParent: "on_close", listed: true },
        { task: "Case #6" },
        { task: "Case #7", notifyParent: "on_close" },
        { task: "Case #8" },
      ]);
    }),
  );
});

describe("caseClosedDispatch", () => {
  it.effect.each(["thread.settled", "thread.archived"] as const)(
    "tells the parent once when the user closes an owner-facing child: %s",
    (type) =>
      Effect.gen(function* () {
        const closed = child(
          type === "thread.settled"
            ? { settledOverride: "settled" }
            : { archivedAt: DateTime.makeUnsafe("2026-11-12T14:35:00.000Z") },
        );
        const notice = yield* caseClosedDispatch(reader({ child: closed }), event(type));
        assert.isNotNull(notice);
        assert.strictEqual(notice.threadId, parentId);
        assert.strictEqual(notice.commandId, `server:fork-case-closed:${childId}`);
        assert.strictEqual(notice.dispatchMode.type, "queue_after_active");
        assert.include(notice.text, `"Case #5" (threadId ${childId}, task ${taskId})`);
        assert.strictEqual(notice.notification?.summary, "Case #5: closed by the user");
      }),
  );

  it.effect("stays quiet for every other child, close, or parent", () =>
    Effect.gen(function* () {
      const settled = child({ settledOverride: "settled" });
      const quiet = [
        yield* caseClosedDispatch(reader({ child: settled }), event("thread.unsettled")),
        yield* caseClosedDispatch(reader({ child: child() }), event("thread.settled")),
        yield* caseClosedDispatch(
          reader({ child: settled, tasks: [task({ notifyParent: "never" })] }),
          event("thread.settled"),
        ),
        yield* caseClosedDispatch(
          reader({ child: settled, parent: thread({ settledOverride: "settled" }) }),
          event("thread.settled"),
        ),
        yield* caseClosedDispatch(
          reader({
            child: child({
              settledOverride: "settled",
              lineage: { rootThreadId: childId, parentThreadId: null, relationshipToParent: null },
            }),
          }),
          event("thread.settled"),
        ),
      ];
      assert.deepEqual(quiet, [null, null, null, null, null]);
      using _settings = overrideForkFeatureSettings({ features: { ownerFacingTasks: false } });
      assert.isNull(yield* caseClosedDispatch(reader({ child: settled }), event("thread.settled")));
    }),
  );
});
