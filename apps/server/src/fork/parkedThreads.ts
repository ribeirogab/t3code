import {
  CommandId,
  forkFeatureActive,
  type OrchestrationV2ThreadShell,
  type ServerSettings,
  type ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import type * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import type * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";

type ParkedSettings = Pick<ServerSettings, "parkedThreadIds">;

export function isParkedThread(settings: ParkedSettings, threadId: ThreadId): boolean {
  return forkFeatureActive("parkedThreads") && settings.parkedThreadIds.includes(threadId);
}

export function parkedThreadsSettlementKey(settings: ParkedSettings): string {
  return forkFeatureActive("parkedThreads") ? JSON.stringify(settings.parkedThreadIds) : "";
}

export function parkedThreadSettleCommand(
  thread: OrchestrationV2ThreadShell,
  isIdle: (thread: OrchestrationV2ThreadShell) => boolean,
): "thread.auto-settle" | "thread.settle" | null {
  if (thread.settledOverride === "settled" || thread.status === "failed") return null;
  if (!isIdle({ ...thread, settledOverride: null })) return null;
  // thread.auto-settle refuses an explicit override, so an un-settled parked thread needs thread.settle.
  return thread.settledOverride === "active" ? "thread.settle" : "thread.auto-settle";
}

export const settleParkedThreads = Effect.fn("ParkedThreads.settle")(function* (input: {
  readonly settings: ParkedSettings;
  readonly threadId: ThreadId | undefined;
  readonly projections: Pick<ProjectionStore.ProjectionStoreV2Shape, "getThreadShell">;
  readonly orchestrator: Pick<Orchestrator.OrchestratorV2Shape, "dispatch">;
  readonly random: SecureRandom.SecureRandom["Service"];
  readonly isIdle: (thread: OrchestrationV2ThreadShell, nowMs: number) => boolean;
}) {
  const threadIds = input.settings.parkedThreadIds.filter(
    (threadId) =>
      (input.threadId === undefined || threadId === input.threadId) &&
      isParkedThread(input.settings, threadId),
  );
  if (threadIds.length === 0) return;
  const nowMs = DateTime.toEpochMillis(yield* DateTime.now);
  yield* Effect.forEach(
    threadIds,
    (threadId) =>
      Effect.gen(function* () {
        const thread = yield* input.projections.getThreadShell(threadId);
        if (thread === null) return;
        const type = parkedThreadSettleCommand(thread, (shell) => input.isIdle(shell, nowMs));
        if (type === null) return;
        const commandId = CommandId.make(
          `server:parked-settle:${threadId}:${yield* input.random.uuidV4()}`,
        );
        yield* input.orchestrator.dispatch(
          type === "thread.auto-settle"
            ? { type, commandId, threadId, snapshotAt: thread.updatedAt }
            : {
                type,
                commandId,
                threadId,
                ...(thread.latestRunId === null ? {} : { expectedLatestRunId: thread.latestRunId }),
              },
        );
      }).pipe(
        Effect.catchCauseIf(
          (cause) => !Cause.hasInterruptsOnly(cause),
          (cause) =>
            Effect.logWarning("settling a parked thread skipped", {
              threadId,
              cause: Cause.pretty(cause),
            }),
        ),
      ),
    { discard: true },
  );
});
