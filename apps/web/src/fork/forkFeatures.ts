import { useAtomValue } from "@effect/atom-react";
import { isForkFeatureOn } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { primaryServerSettingsAtom } from "~/state/server";

export const FORK_FEATURE_SECTIONS = [
  "Sidebar",
  "Thread details",
  "Chat",
  "Threads",
  "Agents",
] as const;

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
    key: "supervisedTurn",
    section: "Chat",
    searchId: "fork-supervised-turn",
    title: "Supervised turn for a yes",
    description:
      "When a tool in Full access needs a yes that no one can give, offer one Supervised turn.",
    searchTerms: ["fork full access supervised approval consent yes permission runtime mode"],
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
    key: "sharedWorktree",
    section: "Chat",
    searchId: "fork-shared-worktree",
    title: "Shared worktree",
    description:
      "Mark the thread header, and tell the agent, when other active threads use the same worktree.",
    searchTerms: ["fork shared worktree threads commit stage paths header siblings"],
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
    key: "goalComposerCard",
    section: "Chat",
    searchId: "fork-goal-composer-card",
    title: "Goal card on the composer",
    description:
      "Show the thread goal as a card on top of the composer, not as a line in the chat.",
    searchTerms: ["fork goal card composer codex objective clear pause resume expand"],
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
    key: "continueInNewThread",
    section: "Threads",
    searchId: "fork-continue-in-new-thread",
    title: "Continue in new thread",
    description:
      "Add Continue in new thread to the thread menu. The agent writes a handoff and starts the new thread.",
    searchTerms: ["fork continue new thread handoff goal worktree child menu"],
  },
  {
    key: "orchestrationRules",
    section: "Agents",
    searchId: "fork-orchestration-rules",
    title: "Orchestration rules",
    description: "Add the fork's rules to the T3 Code instructions that agents get.",
    searchTerms: ["fork orchestration rules instructions system prompt question tool subsession"],
  },
  {
    key: "quietParentWake",
    section: "Agents",
    searchId: "fork-quiet-parent-wake",
    title: "Quiet parent wake",
    description:
      "Do not wake the parent when you write in its child thread. Agents choose which child events wake them.",
    searchTerms: ["fork notify parent wake child delegate finish question quiet"],
  },
  {
    key: "holdRunningPrChecks",
    section: "Agents",
    searchId: "fork-hold-running-pr-checks",
    title: "Hold running PR checks",
    description:
      "Wake a pull request watcher when the running checks finish, after 30 minutes at most, and once per conflict.",
    searchTerms: ["fork pull request watch checks running hold batch conflict wake"],
  },
  {
    key: "workflowRunWatch",
    section: "Agents",
    searchId: "fork-workflow-run-watch",
    title: "Workflow run watch",
    description: "Let agents watch a GitHub Actions run until it finishes.",
    searchTerms: ["fork workflow run watch github actions ci release wake"],
  },
  {
    key: "goalOnNewThreads",
    section: "Agents",
    searchId: "fork-goal-on-new-threads",
    title: "Goal on new threads",
    description: "Let agents start a delegated or launched thread with a /goal.",
    searchTerms: ["fork goal delegate launch new thread child objective"],
  },
  {
    key: "parkedThreads",
    section: "Sidebar",
    searchId: "fork-parked-threads",
    title: "Parked threads",
    description: "Park a thread to keep it in the Parked shelf, out of the list and auto-settle.",
    searchTerms: ["fork parked park unpark shelf hide keep long lived threads sidebar"],
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

export const goalWaitingEnabledAtom = forkFeatureAtom("goalWaiting");

export function useForkFeature(feature: ForkFeature): boolean {
  return useAtomValue(forkFeatureAtom(feature));
}

export function isForkFeatureEnabled(feature: ForkFeature): boolean {
  return appAtomRegistry.get(forkFeatureAtom(feature));
}
