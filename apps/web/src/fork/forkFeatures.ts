import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

export const FORK_FEATURE_SECTIONS = ["Sidebar", "Thread details", "Chat", "Threads"] as const;

export const FORK_MASTER_SEARCH_ID = "fork-features";

export const FORK_FEATURES = [
  {
    key: "forkPill",
    section: "Sidebar",
    searchId: "fork-pill",
    title: "Fork pill",
    description: "Mark the stage pill in the sidebar as Fork.",
    searchTerms: ["fork pill badge stage nightly sidebar header"],
  },
  {
    key: "titleFirstCards",
    section: "Sidebar",
    searchId: "fork-title-first-cards",
    title: "Title first in thread cards",
    description: "Show the thread title on the first line of a sidebar card.",
    searchTerms: ["fork sidebar card title project first line compact"],
  },
  {
    key: "cardDisplayOptions",
    section: "Sidebar",
    searchId: "fork-card-display-options",
    title: "Card display options",
    description: "Choose the fields of a sidebar card from the sidebar header.",
    searchTerms: ["fork sidebar card fields branch machine model diff terminal pull request"],
  },
  {
    key: "planProgress",
    section: "Sidebar",
    searchId: "fork-plan-progress",
    title: "Plan progress",
    description:
      "Show the done steps of the agent's plan and the next step on cards and in the thread header.",
    searchTerms: ["fork plan progress todo tasks steps percent next done header card"],
  },
  {
    key: "modelIconInTitle",
    section: "Sidebar",
    searchId: "fork-model-icon-in-title",
    title: "Model icon in title",
    description: "Show the provider icon at the start of the thread title in sidebar cards.",
    searchTerms: ["fork sidebar card model provider icon title start"],
  },
  {
    key: "nestedThreads",
    section: "Sidebar",
    searchId: "fork-nested-threads",
    title: "Nested threads",
    description: "Show forks and listed child threads under their parent in the sidebar.",
    searchTerms: ["fork nested child threads subagents tree parent detach hide listed"],
  },
  {
    key: "hideArchivedAgents",
    section: "Thread details",
    searchId: "fork-hide-archived-agents",
    title: "Hide archived agents",
    description: "Leave archived threads out of Previous agents.",
    searchTerms: ["fork previous agents subagents archived thread details"],
  },
  {
    key: "contextBreakdown",
    section: "Thread details",
    searchId: "fork-context-breakdown",
    title: "Context breakdown",
    description: "Open the Context row to see the tokens by category. Claude only.",
    searchTerms: ["fork context window breakdown tokens category mcp memory claude"],
  },
  {
    key: "paceMarker",
    section: "Thread details",
    searchId: "fork-pace-marker",
    title: "Pace marker",
    description: "Mark the even-use pace on the usage limit bars.",
    searchTerms: ["fork pace marker usage limits weekly session bar tick"],
  },
  {
    key: "providerUsage",
    section: "Thread details",
    searchId: "fork-provider-usage",
    title: "Provider usage",
    description: "Add a Provider usage item with the weekly pace of each provider.",
    searchTerms: ["fork provider usage weekly pace deficit reserve accounts thread details"],
  },
  {
    key: "goalWaiting",
    section: "Sidebar",
    searchId: "fork-goal-waiting",
    title: "Waiting while a goal is open",
    description: "Keep a thread with an active /goal in Waiting, not Done.",
    searchTerms: ["fork goal waiting working shelf done completed sidebar"],
  },
  {
    key: "goalPause",
    section: "Chat",
    searchId: "fork-goal-pause",
    title: "Pause goal",
    description: "Add Pause next to a goal's Clear. Pause keeps the goal text for Resume.",
    searchTerms: ["fork goal pause resume clear stop hook objective"],
  },
  {
    key: "publishedPorts",
    section: "Thread details",
    searchId: "fork-published-ports",
    title: "Published ports",
    description: "List the tailnet URLs agents published, with a stop control.",
    searchTerms: ["fork published ports tailnet tailscale serve url publish_port thread details"],
  },
  {
    key: "continueInNewThread",
    section: "Threads",
    searchId: "fork-continue-in-new-thread",
    title: "Continue in new thread",
    description:
      "Add Continue in new thread to the thread menu. The agent writes a handoff and starts the new thread.",
    searchTerms: ["fork continue new thread handoff goal worktree child menu"],
  },
] as const satisfies ReadonlyArray<{
  readonly key: string;
  readonly section: (typeof FORK_FEATURE_SECTIONS)[number];
  readonly searchId: string;
  readonly title: string;
  readonly description: string;
  readonly searchTerms: ReadonlyArray<string>;
}>;

export type ForkFeature = (typeof FORK_FEATURES)[number]["key"];

export type ForkFeatures = Record<ForkFeature, boolean>;

export const DEFAULT_FORK_FEATURES: ForkFeatures = Object.fromEntries(
  FORK_FEATURES.map(({ key }) => [key, true]),
) as ForkFeatures;

export const FORK_SETTINGS_SEARCH_ITEMS = [
  {
    id: FORK_MASTER_SEARCH_ID,
    title: "Fork features",
    to: "/settings/fork" as const,
    searchTerms: ["fork features all upstream master off"],
  },
  ...FORK_FEATURES.map((feature) => ({
    id: feature.searchId,
    title: feature.title,
    to: "/settings/fork" as const,
    searchTerms: feature.searchTerms,
  })),
];

interface ForkSettings {
  master: boolean;
  enabled: ForkFeatures;
}

interface ForkFeaturesState extends ForkSettings {
  setMaster: (master: boolean) => void;
  setEnabled: (feature: ForkFeature, enabled: boolean) => void;
}

export function mergePersistedForkSettings(persisted: unknown): ForkSettings {
  const stored =
    persisted !== null && typeof persisted === "object"
      ? (persisted as Partial<Record<string, unknown>>)
      : {};
  return {
    master: typeof stored.master === "boolean" ? stored.master : true,
    enabled: mergeEnabled(stored.enabled),
  };
}

function mergeEnabled(enabled: unknown): ForkFeatures {
  if (enabled === null || typeof enabled !== "object") return DEFAULT_FORK_FEATURES;
  const stored = enabled as Partial<Record<string, unknown>>;
  return Object.fromEntries(
    FORK_FEATURES.map(({ key }) => {
      const value = stored[key];
      return [key, typeof value === "boolean" ? value : DEFAULT_FORK_FEATURES[key]];
    }),
  ) as ForkFeatures;
}

export function isForkFeatureActive(settings: ForkSettings, feature: ForkFeature): boolean {
  return settings.master && settings.enabled[feature];
}

export const useForkFeaturesStore = create<ForkFeaturesState>()(
  persist(
    (set) => ({
      master: true,
      enabled: DEFAULT_FORK_FEATURES,
      setMaster: (master) => set({ master }),
      setEnabled: (feature, enabled) =>
        set((state) => ({ enabled: { ...state.enabled, [feature]: enabled } })),
    }),
    {
      name: "t3code:fork:features:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ master, enabled }) => ({ master, enabled }),
      merge: (persisted, current) => ({ ...current, ...mergePersistedForkSettings(persisted) }),
    },
  ),
);

export function useForkFeature(feature: ForkFeature): boolean {
  return useForkFeaturesStore((state) => isForkFeatureActive(state, feature));
}

export function isForkFeatureEnabled(feature: ForkFeature): boolean {
  return isForkFeatureActive(useForkFeaturesStore.getState(), feature);
}
