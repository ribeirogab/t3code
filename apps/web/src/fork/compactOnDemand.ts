import { useAtomValue } from "@effect/atom-react";
import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  isForkFeatureOn,
  supportsCompactAndContinue,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { useComposerDraftStore } from "~/composerDraftStore";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { environmentPresentations } from "~/state/presentation";
import { primaryServerSettingsAtom } from "~/state/server";
import { environmentThreadShells } from "~/state/threads";

import {
  compactOnDemandKeepsHistory,
  compactOnDemandTokens,
  goalComposerText,
} from "./compactOnDemand.logic";
import { useForkFeature } from "./forkFeatures";

const armedThreadKeysAtom = Atom.make<ReadonlySet<string>>(new Set<string>()).pipe(Atom.keepAlive);

function setCompactOnDemandArmed(threadKey: string, armed: boolean): void {
  const current = appAtomRegistry.get(armedThreadKeysAtom);
  if (current.has(threadKey) === armed) return;
  const next = new Set(current);
  if (armed) next.add(threadKey);
  else next.delete(threadKey);
  appAtomRegistry.set(armedThreadKeysAtom, next);
}

const useAsGoalAvailableAtom = Atom.family((threadKey: string) =>
  Atom.make((get) => {
    const ref = parseScopedThreadKey(threadKey);
    if (
      ref === null ||
      !isForkFeatureOn(get(primaryServerSettingsAtom).forkFeatures, "useAsGoal")
    ) {
      return false;
    }
    const instanceId = get(environmentThreadShells.threadShellAtom(ref))?.providerInstanceId;
    const driver = get(environmentPresentations.providersByEnvironmentAtom)
      .get(ref.environmentId)
      ?.find((provider) => provider.instanceId === instanceId)?.driver;
    return supportsCompactAndContinue(driver);
  }).pipe(Atom.withLabel(`fork-use-as-goal:${threadKey}`)),
);

export function useUseAsGoalAvailable(threadRef: ScopedThreadRef | undefined): boolean {
  return useAtomValue(useAsGoalAvailableAtom(threadRef ? scopedThreadKey(threadRef) : ""));
}

export function placeCodeAsGoal(threadRef: ScopedThreadRef, code: string): void {
  useComposerDraftStore.getState().setPrompt(threadRef, goalComposerText(code));
  setCompactOnDemandArmed(scopedThreadKey(threadRef), true);
}

export function useCompactOnDemand(input: {
  readonly threadKey: string;
  readonly idleTokens: number | null;
  readonly keepIdleHistory: boolean;
  readonly setIdleKeepFullHistory: (threadKey: string, keep: boolean) => void;
  readonly contextTokens: number | null | undefined;
  readonly driver: string | null | undefined;
  readonly blocked: boolean;
}) {
  const enabled = useForkFeature("useAsGoal");
  const armed = useAtomValue(armedThreadKeysAtom).has(input.threadKey);
  const keepFullHistory = compactOnDemandKeepsHistory({ ...input, armed });
  return {
    resumeCompactionTokens: compactOnDemandTokens({ ...input, enabled }),
    keepFullHistory,
    setKeepFullHistory: (threadKey: string, keep: boolean) => {
      input.setIdleKeepFullHistory(threadKey, keep);
      if (!keep) setCompactOnDemandArmed(threadKey, false);
    },
    toggleKeepFullHistory: () => {
      setCompactOnDemandArmed(input.threadKey, keepFullHistory);
      if (input.idleTokens !== null)
        input.setIdleKeepFullHistory(input.threadKey, !keepFullHistory);
    },
  };
}
