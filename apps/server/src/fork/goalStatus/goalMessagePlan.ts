import type {
  OrchestrationV2AppThread,
  OrchestrationV2Command,
  OrchestrationV2ProviderThread,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { ProjectionStoreV2Error } from "../../orchestration-v2/ProjectionStore.ts";
import { planGoalMessage, wantsGoalForMessage } from "./goalStatusRules.ts";

interface ProviderThreadReader {
  readonly getThreadRecords: (
    threadId: ThreadId,
    fields: ReadonlyArray<"providerThreads">,
  ) => Effect.Effect<
    { readonly providerThreads: ReadonlyArray<OrchestrationV2ProviderThread> },
    ProjectionStoreV2Error
  >;
}

export const goalMessagePlan = Effect.fn("fork.goalStatus.goalMessagePlan")(function* (
  reader: ProviderThreadReader,
  command: Extract<OrchestrationV2Command, { readonly type: "message.dispatch" }>,
  thread: Pick<OrchestrationV2AppThread, "activeProviderThreadId" | "forkAttention">,
) {
  const activeProviderThreadId = thread.activeProviderThreadId;
  const goalThread =
    activeProviderThreadId !== null && wantsGoalForMessage(command)
      ? (yield* reader.getThreadRecords(command.threadId, [
          "providerThreads",
        ])).providerThreads.find((candidate) => candidate.id === activeProviderThreadId)
      : undefined;
  return planGoalMessage({ command, attention: thread.forkAttention, goalThread });
});
