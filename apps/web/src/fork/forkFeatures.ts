import { useAtomValue } from "@effect/atom-react";
import { isForkFeatureOn } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { primaryServerSettingsAtom } from "~/state/server";

export const FORK_FEATURE_SECTIONS = ["Sidebar", "Thread details", "Chat", "Agents"] as const;

export const FORK_MASTER_SEARCH_ID = "fork-features";

export const FORK_FEATURES = [
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
    key: "centerChatBesideDetails",
    section: "Chat",
    searchId: "fork-center-chat-beside-details",
    title: "Center chat beside thread details",
    description: "Center the chat in the free space left of the open Thread details card.",
    searchTerms: ["fork center chat thread details card free space lane layout middle"],
  },
  {
    key: "newThreadNoProject",
    section: "Chat",
    searchId: "fork-new-thread-no-project",
    title: "New thread without a project",
    description:
      "New thread opens with No project. Pick the project in the header or below the composer.",
    searchTerms: ["fork new thread no project scratch picker header composer choose folder"],
  },
  {
    key: "publishedPorts",
    section: "Thread details",
    searchId: "fork-published-ports",
    title: "Published ports",
    description: "Let agents publish tailnet URLs, and list them with a stop control.",
    searchTerms: ["fork published ports tailnet tailscale serve url publish_port thread details"],
  },
  {
    key: "useAsGoal",
    section: "Chat",
    searchId: "fork-use-as-goal",
    title: "Use as goal",
    description:
      "Add Use as goal to code blocks, and show Compact in the composer on demand. Use as goal turns Compact on. Claude and Codex only.",
    searchTerms: ["fork use as goal code block composer compact before send"],
  },
  {
    key: "parkedThreads",
    section: "Sidebar",
    searchId: "fork-parked-threads",
    title: "Parked threads",
    description: "Park a thread to keep it settled, in the Parked shelf.",
    searchTerms: ["fork parked park unpark shelf hide keep long lived threads sidebar settled"],
  },
  {
    key: "sidebarFooterFork",
    section: "Sidebar",
    searchId: "fork-sidebar-footer-fork",
    title: "Fork in sidebar footer",
    description: "Add a Fork button next to Settings in the sidebar footer.",
    searchTerms: ["fork sidebar footer button icon settings shortcut"],
  },
  {
    key: "hideSidebarFooterPullRequests",
    section: "Sidebar",
    searchId: "fork-hide-sidebar-footer-pull-requests",
    title: "Hide Pull requests in sidebar footer",
    description: "Leave the Pull requests button out of the sidebar footer.",
    searchTerms: ["fork sidebar footer button icon pull requests hide show"],
  },
  {
    key: "hideSidebarFooterUsage",
    section: "Sidebar",
    searchId: "fork-hide-sidebar-footer-usage",
    title: "Hide Usage in sidebar footer",
    description: "Leave the Usage button out of the sidebar footer.",
    searchTerms: ["fork sidebar footer button icon usage limits hide show"],
  },
  {
    key: "agentLanguage",
    section: "Agents",
    searchId: "fork-agent-language-toggle",
    title: "Agent language",
    description: "Tell agents the answer language below.",
    searchTerms: ["fork agent language reply answer portuguese english instructions"],
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

const forkFeatureAtom = Atom.family((feature: ForkFeature) =>
  Atom.make((get) => isForkFeatureOn(get(primaryServerSettingsAtom).forkFeatures, feature)).pipe(
    Atom.withLabel(`fork-feature:${feature}`),
  ),
);

export function useForkFeature(feature: ForkFeature): boolean {
  return useAtomValue(forkFeatureAtom(feature));
}

export function isForkFeatureEnabled(feature: ForkFeature): boolean {
  return appAtomRegistry.get(forkFeatureAtom(feature));
}
