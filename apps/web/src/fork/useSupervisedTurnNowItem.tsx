import type { EnvironmentThreadShell, ThreadStructure } from "@t3tools/client-runtime/state/shell";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, RunId, RuntimeMode, ScopedThreadRef } from "@t3tools/contracts";
import { ShieldAlertIcon } from "lucide-react";

import { InlineButton } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import type { ThreadNowItem } from "~/components/chat/ThreadNow";
import { newMessageId } from "~/lib/utils";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { useQuietThreadProjection } from "~/state/entities";
import { environmentThreadShells, threadEnvironment } from "~/state/threads";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import { waitForAtomValue } from "~/state/waitForAtomValue";

import { useForkFeature } from "./forkFeatures";
import {
  lastOwnerMessageText,
  runNeedsYes,
  shouldOfferSupervisedTurn,
  useSupervisedTurnStore,
} from "./fullAccessConsent";

const SUPERVISED_TURN_MAX_WAIT_MS = 12 * 60 * 60 * 1000;

function runEndedAfter(shell: EnvironmentThreadShell | null, runIdBefore: RunId | null): boolean {
  const latestRun = shell?.latestRun ?? null;
  return (
    shell === null ||
    (latestRun !== null && latestRun.runId !== runIdBefore && latestRun.completedAt !== null)
  );
}

function failureMessage(result: AtomCommandResult<unknown, unknown>): string | null {
  if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "An error occurred.";
}

export function useSupervisedTurnNowItem(input: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
  readonly threadDetailRef: ScopedThreadRef | null;
  readonly threadShell: EnvironmentThreadShell | null;
  readonly runtimeMode: RuntimeMode;
  readonly isWorking: boolean;
  readonly turnItems: ThreadStructure["turnItems"];
}): ThreadNowItem | null {
  const { environmentId, threadRef, threadShell } = input;
  const enabled = useForkFeature("supervisedTurn");
  const threadKey = threadRef === null ? null : `${threadRef.environmentId}:${threadRef.threadId}`;
  const switching = useSupervisedTurnStore((state) =>
    threadKey === null ? false : state.switchingThreadKeys[threadKey] === true,
  );
  const messages = useQuietThreadProjection(enabled ? input.threadDetailRef : null)?.projection
    .messages;
  const setRuntimeMode = useOrchestrationCommand(threadEnvironment.setRuntimeMode, {
    reportFailure: false,
  });
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, {
    reportFailure: false,
  });
  const latestRunId = threadShell?.latestRun?.runId ?? null;
  const ownerMessageText = messages === undefined ? null : lastOwnerMessageText(messages);
  const offered = shouldOfferSupervisedTurn({
    enabled,
    runtimeMode: input.runtimeMode,
    isWorking: input.isWorking,
    switching,
    latestRunNeedsYes: runNeedsYes(input.turnItems, latestRunId),
    ownerMessageText,
  });
  if (!offered || threadRef === null || threadKey === null || threadShell === null) return null;
  const text = ownerMessageText ?? "";
  const interactionMode = threadShell.interactionMode;
  const restoreMode = input.runtimeMode;

  const switchMode = (runtimeMode: RuntimeMode) =>
    setRuntimeMode({
      environmentId,
      input: { threadId: threadRef.threadId, runtimeMode, createdAt: new Date().toISOString() },
    });

  const runSupervisedTurn = async () => {
    const { setSwitching } = useSupervisedTurnStore.getState();
    setSwitching(threadKey, true);
    const report = (title: string, result: AtomCommandResult<unknown, unknown>) => {
      const description = failureMessage(result);
      if (description !== null) toastManager.add({ type: "error", title, description });
    };
    const switched = await switchMode("approval-required");
    if (switched._tag === "Failure") {
      report("Failed to switch to Supervised", switched);
      setSwitching(threadKey, false);
      return;
    }
    const createdAt = new Date().toISOString();
    const started = await startTurn({
      environmentId,
      input: {
        threadId: threadRef.threadId,
        message: { messageId: newMessageId(), role: "user", text, attachments: [] },
        runtimeMode: "approval-required",
        interactionMode,
        createdAt,
      },
    });
    if (started._tag === "Success") {
      await waitForAtomValue({
        registry: appAtomRegistry,
        atom: environmentThreadShells.threadShellAtom(threadRef),
        predicate: (shell) => runEndedAfter(shell, latestRunId),
        timeoutMs: SUPERVISED_TURN_MAX_WAIT_MS,
      });
    } else {
      report("Failed to send the message again", started);
    }
    report("Failed to switch back to Full access", await switchMode(restoreMode));
    setSwitching(threadKey, false);
  };

  return {
    id: `supervised-turn:${threadKey}`,
    icon: <ShieldAlertIcon className="text-warning-foreground" />,
    title: "This step needs your yes.",
    description: "Switch this thread to Supervised for one turn?",
    actions: <InlineButton onClick={() => void runSupervisedTurn()}>Switch</InlineButton>,
  };
}
