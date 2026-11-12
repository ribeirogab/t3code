import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef, ThreadHandoffPlacement } from "@t3tools/contracts";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { newMessageId } from "~/lib/utils";
import { readThreadShell } from "~/state/entities";
import { threadEnvironment } from "~/state/threads";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";

import { continueInNewThreadPrompt } from "./continueInNewThread";

export function useContinueInNewThread() {
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  return async (threadRef: ScopedThreadRef, placement: ThreadHandoffPlacement) => {
    const thread = readThreadShell(threadRef);
    if (thread === null) return;
    const result = await startTurn({
      environmentId: threadRef.environmentId,
      input: {
        threadId: threadRef.threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: continueInNewThreadPrompt(placement),
          attachments: [],
        },
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        dispatchMode: "queue",
        createdAt: new Date().toISOString(),
      },
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not ask for a handoff",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    }
  };
}
