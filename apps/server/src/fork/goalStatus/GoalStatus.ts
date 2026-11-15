import {
  CommandId,
  forkFeatureActive,
  type ForkGoalUpdateStatus,
  type ForkThreadAttention,
  type OrchestrationV2AppThread,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Orchestrator from "../../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../../orchestration-v2/ProjectionStore.ts";
import { childEventWakesParent } from "../notifyParent.ts";
import {
  canPauseGoal,
  goalClearCommand,
  goalUpdateAttention,
  ownerWatchesThread,
  parentAttentionWake,
  requestedAttention,
} from "./goalStatusRules.ts";

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

export type AttentionRequestOutcome = "goal" | "thread" | "parent";

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
    readonly request: (input: {
      readonly commandId: CommandId;
      readonly threadId: ThreadId;
      readonly summary: string;
    }) => Effect.Effect<AttentionRequestOutcome, GoalStatusError>;
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
        detail: forkFeatureActive("requestAttention")
          ? "This thread has no goal. Call t3_request_attention instead."
          : "This thread has no goal. Ask the user with your question tool instead.",
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

  const parentToWake = Effect.fnUntraced(function* (thread: OrchestrationV2AppThread) {
    const parentThreadId = thread.lineage.parentThreadId;
    if (parentThreadId === null || ownerWatchesThread(thread.lineage)) return undefined;
    const parent = yield* projections.getThreadRecords(parentThreadId, ["subagents"]);
    if (parent.thread.archivedAt !== null || parent.thread.deletedAt !== null) return undefined;
    const task = parent.subagents.findLast(
      (candidate) => candidate.origin === "app_owned" && candidate.childThreadId === thread.id,
    );
    if (task === undefined) return undefined;
    const { runs } = yield* projections.getThreadRecords(thread.id, ["runs"]);
    const run = runs.toSorted((left, right) => right.ordinal - left.ordinal)[0];
    const starter =
      run === undefined ? undefined : yield* projections.getRunMessage(thread.id, run.id);
    const wakes = childEventWakesParent({
      notifyParent: task.notifyParent,
      event: "question",
      starter,
    });
    return wakes ? { parentThreadId, task } : undefined;
  });

  const request: GoalStatus["Service"]["request"] = Effect.fn("GoalStatus.request")(
    function* (input) {
      const { thread, providerThreads } = yield* projections
        .getThreadRecords(input.threadId, ["providerThreads"])
        .pipe(Effect.mapError(failed("The thread could not be read.")));
      const goalThread = providerThreads.find(
        (candidate) => candidate.id === thread.activeProviderThreadId,
      );
      const { commandId, threadId, summary } = input;
      if (
        forkFeatureActive("goalStatus") &&
        canPauseGoal(goalThread) &&
        goalThread.goal.status === "active"
      ) {
        yield* update({
          commandId,
          threadId,
          status: "needs_user",
          reason: summary,
          result: undefined,
        });
        return "goal";
      }
      yield* mark({ commandId, threadId, attention: requestedAttention(summary) });
      const wake = yield* parentToWake(thread).pipe(
        Effect.mapError(failed("The parent thread could not be read.")),
      );
      if (wake === undefined) return "thread";
      yield* engine
        .dispatch(
          parentAttentionWake({
            commandId,
            parentThreadId: wake.parentThreadId,
            childThreadId: thread.id,
            task: wake.task,
            summary,
          }),
        )
        .pipe(Effect.mapError(failed("The parent thread was not told.")));
      return "parent";
    },
  );

  return { update, hold, mark, request } satisfies GoalStatus["Service"];
});

export const layer = Layer.effect(GoalStatus, make);
