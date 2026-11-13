import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  isAtomCommandInterrupted,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import * as Schema from "effect/Schema";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { environmentCatalog } from "~/connection/catalog";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { serverEnvironment } from "~/state/server";

import { isForkFeatureEnabled, useForkFeature } from "./forkFeatures";

const PARKED_SHELF_EXPANDED_KEY = "t3code:sidebar:parked-expanded";

const parkedThreadKeysAtom = Atom.make((get) => {
  const keys = new Set<string>();
  for (const environmentId of get(environmentCatalog.catalogValueAtom).entries.keys()) {
    const settings = get(serverEnvironment.settingsValueAtom(environmentId));
    for (const threadId of settings?.parkedThreadIds ?? []) {
      keys.add(scopedThreadKey(scopeThreadRef(environmentId, threadId)));
    }
  }
  return keys;
}).pipe(Atom.withLabel("fork-parked-thread-keys"));

export function useParkedThreadKeys(): ReadonlySet<string> | null {
  const enabled = useForkFeature("parkedThreads");
  const keys = useAtomValue(parkedThreadKeysAtom);
  return enabled ? keys : null;
}

export function useParkedShelfExpanded() {
  return useLocalStorage(PARKED_SHELF_EXPANDED_KEY, false, Schema.Boolean);
}

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
  const result = await runAtomCommand(
    appAtomRegistry,
    serverEnvironment.updateSettings,
    {
      environmentId: threadRef.environmentId,
      input: { patch: { parkedThreadIds: parked ? [...others, threadRef.threadId] : others } },
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
