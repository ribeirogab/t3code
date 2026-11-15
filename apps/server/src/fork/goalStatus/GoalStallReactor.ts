import {
  CommandId,
  forkFeatureActive,
  type OrchestrationV2DomainEvent,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import * as Orchestrator from "../../orchestration-v2/Orchestrator.ts";
import { forkParked } from "../../serverActivation.ts";
import * as GoalStatus from "./GoalStatus.ts";
import { goalStallStep, isGoalWork, type GoalStallState } from "./goalStatusRules.ts";

const IDLE_GOAL: GoalStallState = { checks: 0, worked: true, lastText: null };

export class GoalStallReactor extends Context.Service<
  GoalStallReactor,
  {
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
    readonly handle: (event: OrchestrationV2DomainEvent) => Effect.Effect<void>;
  }
>()("t3/fork/goalStatus/GoalStallReactor") {}

const make = Effect.gen(function* () {
  const engine = yield* Orchestrator.OrchestratorV2;
  const goals = yield* GoalStatus.GoalStatus;
  const watched = new Map<ThreadId, GoalStallState>();

  const note = (threadId: ThreadId, change: Partial<GoalStallState>) => {
    const state = watched.get(threadId);
    if (state !== undefined) watched.set(threadId, { ...state, ...change });
  };

  const handle: GoalStallReactor["Service"]["handle"] = Effect.fnUntraced(
    function* (event) {
      if (!forkFeatureActive("goalStatus")) return;
      switch (event.type) {
        case "turn-item.updated":
          if (isGoalWork(event.payload)) note(event.threadId, { worked: true, lastText: null });
          return;
        case "message.updated":
          if (
            event.payload.role === "assistant" &&
            !event.payload.streaming &&
            event.payload.text.trim().length > 0
          ) {
            note(event.threadId, { lastText: event.payload.text });
          }
          return;
        case "provider-thread.updated": {
          const providerThread = event.payload;
          if (providerThread.ownerNodeId !== null) return;
          const goal = providerThread.goal;
          const previous = watched.get(event.threadId);
          if (goal?.status !== "active") {
            watched.delete(event.threadId);
            if (goal?.status !== "complete" || previous === undefined) return;
            yield* goals.mark({
              commandId: CommandId.make(`fork:goal-done:${event.id}`),
              threadId: event.threadId,
              attention: { status: "done", goal: goal.objective },
            });
            return;
          }
          if (providerThread.driver !== "claudeAgent") {
            if (previous === undefined) watched.set(event.threadId, IDLE_GOAL);
            return;
          }
          const step = goalStallStep({
            previous,
            checks: goal.checks ?? 0,
            judgeReason: goal.lastCheck,
          });
          if (step.type === "watch") {
            watched.set(event.threadId, step.state);
            return;
          }
          watched.delete(event.threadId);
          yield* goals.hold({
            commandId: CommandId.make(`fork:goal-stall:${event.id}`),
            threadId: event.threadId,
            attention: { status: "needs_user", reason: step.reason, goal: goal.objective },
          });
          return;
        }
        default:
          return;
      }
    },
    (effect, event) =>
      effect.pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("a stalled goal could not pause", { threadId: event.threadId, cause }),
        ),
      ),
  );

  const start: GoalStallReactor["Service"]["start"] = () =>
    forkParked(
      Stream.runForEach(engine.streamDomainEvents, handle).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("goal stall event stream failed", { cause }),
        ),
      ),
    );

  return { start, handle } satisfies GoalStallReactor["Service"];
});

export const layer = Layer.effect(GoalStallReactor, make).pipe(Layer.provide(GoalStatus.layer));

export const layerStarted = Layer.effectDiscard(
  Effect.gen(function* () {
    const reactor = yield* GoalStallReactor;
    yield* reactor.start();
  }),
).pipe(Layer.provide(layer));
