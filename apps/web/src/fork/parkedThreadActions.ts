import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  isAtomCommandInterrupted,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { serverEnvironment } from "~/state/server";
import { threadEnvironment } from "~/state/threads";

import { isForkFeatureEnabled } from "./forkFeatures";

/** Null when the thread cannot be parked: the feature is off, it is a child, or settings are not loaded. */
export function readThreadParked(
  threadRef: ScopedThreadRef,
  thread: Pick<EnvironmentThreadShell, "lineage">,
): boolean | null {
  if (!isForkFeatureEnabled("parkedThreads") || thread.lineage.parentThreadId !== null) {
    return null;
  }
  const settings = appAtomRegistry.get(
    serverEnvironment.settingsValueAtom(threadRef.environmentId),
  );
  return settings ? settings.parkedThreadIds.includes(threadRef.threadId) : null;
}

export async function setThreadParked(threadRef: ScopedThreadRef, parked: boolean) {
  const settings = appAtomRegistry.get(
    serverEnvironment.settingsValueAtom(threadRef.environmentId),
  );
  const others = (settings?.parkedThreadIds ?? []).filter((id) => id !== threadRef.threadId);
  const parkedResult = await runAtomCommand(
    appAtomRegistry,
    serverEnvironment.updateSettings,
    {
      environmentId: threadRef.environmentId,
      input: { patch: { parkedThreadIds: parked ? [...others, threadRef.threadId] : others } },
    },
    { reportFailure: false },
  );
  const result =
    parked || parkedResult._tag === "Failure"
      ? parkedResult
      : await runAtomCommand(
          appAtomRegistry,
          threadEnvironment.unsettle,
          {
            environmentId: threadRef.environmentId,
            input: { threadId: threadRef.threadId, reason: "user" },
          },
          { reportFailure: false },
        );
  if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
    const error = squashAtomCommandFailure(result);
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: parked ? "Failed to park thread" : "Failed to unpark thread",
        description: error instanceof Error ? error.message : "An error occurred.",
      }),
    );
  }
}
