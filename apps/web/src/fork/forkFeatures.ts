import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

export const FORK_FEATURES = [
  {
    key: "forkPill",
    searchId: "fork-pill",
    title: "Fork pill",
    description: "Mark the stage pill in the sidebar as Fork.",
    searchTerms: ["fork pill badge stage nightly sidebar header"],
  },
  {
    key: "titleFirstCards",
    searchId: "fork-title-first-cards",
    title: "Title first in thread cards",
    description: "Show the thread title on the first line of a sidebar card.",
    searchTerms: ["fork sidebar card title project first line compact"],
  },
  {
    key: "cardDisplayOptions",
    searchId: "fork-card-display-options",
    title: "Card display options",
    description: "Choose the fields of a sidebar card from the sidebar header.",
    searchTerms: ["fork sidebar card fields branch machine model diff terminal pull request"],
  },
  {
    key: "modelIconInTitle",
    searchId: "fork-model-icon-in-title",
    title: "Model icon in title",
    description: "Show the provider icon at the start of the thread title in sidebar cards.",
    searchTerms: ["fork sidebar card model provider icon title start"],
  },
  {
    key: "nestedThreads",
    searchId: "fork-nested-threads",
    title: "Nested threads",
    description: "Show forks and listed child threads under their parent in the sidebar.",
    searchTerms: ["fork nested child threads subagents tree parent detach hide listed"],
  },
  {
    key: "hideArchivedAgents",
    searchId: "fork-hide-archived-agents",
    title: "Hide archived agents",
    description: "Leave archived threads out of Previous agents in thread details.",
    searchTerms: ["fork previous agents subagents archived thread details"],
  },
  {
    key: "paceMarker",
    searchId: "fork-pace-marker",
    title: "Pace marker",
    description: "Mark the even-use pace on the usage limit bars.",
    searchTerms: ["fork pace marker usage limits weekly session bar tick"],
  },
  {
    key: "contextBreakdown",
    searchId: "fork-context-breakdown",
    title: "Context breakdown",
    description: "Open the Context row to see the tokens by category. Claude only.",
    searchTerms: ["fork context window breakdown tokens category mcp memory claude"],
  },
  {
    key: "providerUsage",
    searchId: "fork-provider-usage",
    title: "Provider usage",
    description:
      "Add a Provider usage item to thread details with the weekly pace of each provider.",
    searchTerms: ["fork provider usage weekly pace deficit reserve accounts thread details"],
  },
  {
    key: "goalWaiting",
    searchId: "fork-goal-waiting",
    title: "Waiting while a goal is open",
    description: "Keep a thread with an active /goal in Waiting, not Done.",
    searchTerms: ["fork goal waiting working shelf done completed sidebar"],
  },
] as const;

export type ForkFeature = (typeof FORK_FEATURES)[number]["key"];

export type ForkFeatures = Record<ForkFeature, boolean>;

export const DEFAULT_FORK_FEATURES: ForkFeatures = Object.fromEntries(
  FORK_FEATURES.map(({ key }) => [key, true]),
) as ForkFeatures;

export const FORK_SETTINGS_SEARCH_ITEMS = FORK_FEATURES.map((feature) => ({
  id: feature.searchId,
  title: feature.title,
  to: "/settings/fork" as const,
  searchTerms: feature.searchTerms,
}));

interface ForkFeaturesState {
  enabled: ForkFeatures;
  setEnabled: (feature: ForkFeature, enabled: boolean) => void;
}

export function mergePersistedForkFeatures(persisted: unknown): ForkFeatures {
  const enabled =
    persisted !== null && typeof persisted === "object" && "enabled" in persisted
      ? persisted.enabled
      : null;
  if (enabled === null || typeof enabled !== "object") return DEFAULT_FORK_FEATURES;
  const stored = enabled as Partial<Record<string, unknown>>;
  return Object.fromEntries(
    FORK_FEATURES.map(({ key }) => {
      const value = stored[key];
      return [key, typeof value === "boolean" ? value : DEFAULT_FORK_FEATURES[key]];
    }),
  ) as ForkFeatures;
}

export const useForkFeaturesStore = create<ForkFeaturesState>()(
  persist(
    (set) => ({
      enabled: DEFAULT_FORK_FEATURES,
      setEnabled: (feature, enabled) =>
        set((state) => ({ enabled: { ...state.enabled, [feature]: enabled } })),
    }),
    {
      name: "t3code:fork:features:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ enabled }) => ({ enabled }),
      merge: (persisted, current) => ({
        ...current,
        enabled: mergePersistedForkFeatures(persisted),
      }),
    },
  ),
);

export function useForkFeature(feature: ForkFeature): boolean {
  return useForkFeaturesStore((state) => state.enabled[feature]);
}

export function isForkFeatureEnabled(feature: ForkFeature): boolean {
  return useForkFeaturesStore.getState().enabled[feature];
}
