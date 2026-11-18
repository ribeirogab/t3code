import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import * as Schema from "effect/Schema";

import { environmentCatalog } from "~/connection/catalog";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { serverEnvironment } from "~/state/server";

import { useForkFeature } from "./forkFeatures";
import type { ParkedThreadIds } from "./parkedThreads.logic";

const PARKED_SHELF_EXPANDED_KEY = "t3code:sidebar:parked-expanded";

const parkedThreadIdsAtom = Atom.make((get): ParkedThreadIds => {
  const parkedThreadIds = new Map<EnvironmentId, ReadonlySet<ThreadId>>();
  for (const environmentId of get(environmentCatalog.catalogValueAtom).entries.keys()) {
    const settings = get(serverEnvironment.settingsValueAtom(environmentId));
    if (settings) parkedThreadIds.set(environmentId, new Set(settings.parkedThreadIds));
  }
  return parkedThreadIds;
}).pipe(Atom.withLabel("fork-parked-thread-ids"));

const parkedThreadKeysAtom = Atom.make((get) => {
  const keys = new Set<string>();
  for (const [environmentId, threadIds] of get(parkedThreadIdsAtom)) {
    for (const threadId of threadIds) {
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

export function useParkedThreadIds(): ParkedThreadIds | null {
  const enabled = useForkFeature("parkedThreads");
  const parkedThreadIds = useAtomValue(parkedThreadIdsAtom);
  return enabled ? parkedThreadIds : null;
}

export function useParkedShelfExpanded() {
  return useLocalStorage(PARKED_SHELF_EXPANDED_KEY, false, Schema.Boolean);
}
