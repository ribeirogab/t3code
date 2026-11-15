import {
  CommandId,
  type ForkGoalUpdateStatus,
  type ForkThreadAttention,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Orchestrator from "../../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../../orchestration-v2/ProjectionStore.ts";
import { canPauseGoal, goalClearCommand, goalUpdateAttention } from "./goalStatusRules.ts";

class GoalStatusError extends Schema.TaggedError<GoalStatusError>()("GoalStatusError", {
  detail: Schema.String,
}) {}

interface GoalUpdate {
  readonly commandId: CommandId;
  readonly threadId: ThreadId;
  readonly status: ForkGoalUpdateStatus;
  readonly reason: string;
  readonly result: string | undefined;
}

export class GoalStatus extends Context.Service<
  GoalStatus,
  {
    readonly update: (input: GoalUpdate) => Effect.Effect<ForkThreadAttention, GoalStatusError>;
    readonly hold: (input: {
      readonly commandId: CommandId;
      readonly threadId: ThreadId;
      readonly attention: ForkThreadAttention;
    }) => Effect.Effect<void, GoalStatusError>;
    readonly mark: (input: {
      readonly commandId: CommandId;
      readonly threadId: ThreadId;
      readonly attention: ForkThreadAttention;
    }) => Effect.Effect<void, GoalStatusError>;
  }
>()("t3/fork/goalStatus/GoalStatus") {}

const failed = (detail: string) => () => new GoalStatusError({ detail });

const make = Effect.gen(function* () {
  const engine = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;

  const mark: GoalStatus["Service"]["mark"] = Effect.fn("GoalStatus.mark")(function* (input) {
    yield* engine
      .dispatch({
        type: "thread.metadata.update",
        commandId: CommandId.make(`${input.commandId}:fork-attention`),
        threadId: input.threadId,
        forkAttention: input.attention,
      })
      .pipe(Effect.mapError(failed("The goal status was not saved.")));
  });

  const hold: GoalStatus["Service"]["hold"] = Effect.fn("GoalStatus.hold")(function* (input) {
    yield* mark(input);
    yield* engine
      .dispatch(goalClearCommand({ commandId: input.commandId, threadId: input.threadId }))
      .pipe(Effect.mapError(failed("The goal was not cleared.")));
  });

  const update: GoalStatus["Service"]["update"] = Effect.fn("GoalStatus.update")(function* (input) {
    const { thread, providerThreads } = yield* projections
      .getThreadRecords(input.threadId, ["providerThreads"])
      .pipe(Effect.mapError(failed("The thread could not be read.")));
    const goalThread = providerThreads.find(
      (candidate) => candidate.id === thread.activeProviderThreadId,
    );
    if (goalThread?.goal == null) {
      return yield* new GoalStatusError({
        detail: "This thread has no goal. Ask the user with your question tool instead.",
      });
    }
    if (!canPauseGoal(goalThread)) {
      return yield* new GoalStatusError({
        detail: "T3 Code cannot clear the goal of this provider. Ask the user to clear it.",
      });
    }
    const attention = goalUpdateAttention({
      status: input.status,
      reason: input.reason,
      result: input.result,
      objective: goalThread.goal.objective,
    });
    yield* hold({ commandId: input.commandId, threadId: input.threadId, attention });
    return attention;
  });

  return { update, hold, mark } satisfies GoalStatus["Service"];
});

export const layer = Layer.effect(GoalStatus, make);
