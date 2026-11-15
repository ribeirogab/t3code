import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { supportsCompactAndContinue, type ScopedThreadRef } from "@t3tools/contracts";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { newMessageId } from "~/lib/utils";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { readThreadShell } from "~/state/entities";
import { environmentPresentations } from "~/state/presentation";
import { threadEnvironment } from "~/state/threads";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";

import { COMPACT_AND_CONTINUE_RESUME_TEXT } from "./compactAndContinue";
import { isForkFeatureEnabled } from "./forkFeatures";

export function readCanCompactAndContinue(threadRef: ScopedThreadRef): boolean {
  if (!isForkFeatureEnabled("compactAndContinue")) return false;
  const instanceId = readThreadShell(threadRef)?.providerInstanceId;
  const driver = appAtomRegistry
    .get(environmentPresentations.providersByEnvironmentAtom)
    .get(threadRef.environmentId)
    ?.find((provider) => provider.instanceId === instanceId)?.driver;
  return supportsCompactAndContinue(driver);
}

export function useCompactAndContinue() {
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  return async (threadRef: ScopedThreadRef) => {
    const thread = readThreadShell(threadRef);
    if (thread === null) return;
    const send = (text: string, idleCompaction?: "onReturn") =>
      startTurn({
        environmentId: threadRef.environmentId,
        input: {
          threadId: threadRef.threadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text,
            attachments: [],
            ...(idleCompaction === undefined ? {} : { idleCompaction }),
          },
          runtimeMode: thread.runtimeMode,
          interactionMode: thread.interactionMode,
          dispatchMode: "queue",
          createdAt: new Date().toISOString(),
        },
      });
    const compacted = await send("/compact", "onReturn");
    const result =
      compacted._tag === "Failure" ? compacted : await send(COMPACT_AND_CONTINUE_RESUME_TEXT);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not compact and continue",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    }
  };
}
