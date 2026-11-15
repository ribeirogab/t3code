import {
  threadNeedsYou,
  type ForkThreadAttention,
  type OrchestrationV2ProviderGoal,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";

import { isForkFeatureEnabled } from "./forkFeatures";

export type GoalChipTone = "attention" | "warning" | "success" | "muted";

export interface GoalChip {
  readonly label: string;
  readonly tone: GoalChipTone;
}

export interface GoalResultLink {
  readonly href: string | null;
  readonly label: string;
}

export type GoalStatusCard =
  | {
      readonly kind: "held";
      readonly icon: "goal" | "paused";
      readonly chip: GoalChip;
      readonly summary: string;
      readonly objective: string;
    }
  | {
      readonly kind: "done";
      readonly chip: GoalChip;
      readonly summary: string | null;
      readonly result: GoalResultLink | null;
    };

const HELD_CHIPS = {
  needs_user: { label: "Needs you", tone: "attention" },
  blocked: { label: "Blocked", tone: "warning" },
  question: { label: "Paused · you asked a question", tone: "muted" },
  paused: { label: "Paused", tone: "muted" },
} as const satisfies Record<Exclude<ForkThreadAttention["status"], "done">, GoalChip>;

const DONE_CHIP: GoalChip = { label: "Done", tone: "success" };

const GITHUB_RESULT =
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/(pull|issues|releases\/tag)\/([^/?#]+)/u;

export function goalResultLink(result: string): GoalResultLink {
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    return { href: null, label: result };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { href: null, label: result };
  const github = GITHUB_RESULT.exec(result);
  if (github?.[1] === "pull") return { href: result, label: `PR #${github[2]}` };
  if (github?.[1] === "issues") return { href: result, label: `Issue #${github[2]}` };
  if (github?.[1] === "releases/tag") return { href: result, label: `Release ${github[2]}` };
  return { href: result, label: `${url.host}${url.pathname === "/" ? "" : url.pathname}` };
}

export function resolveGoalStatusCard(input: {
  readonly enabled: boolean;
  readonly attention: ForkThreadAttention | null | undefined;
  readonly goal: OrchestrationV2ProviderGoal | null;
}): GoalStatusCard | "hidden" | null {
  const { attention, goal } = input;
  if (!input.enabled) return null;
  if (attention?.status === "done") {
    const result = attention.result === undefined ? null : goalResultLink(attention.result);
    return {
      kind: "done",
      chip: DONE_CHIP,
      summary: result === null ? (attention.reason ?? attention.goal ?? null) : null,
      result,
    };
  }
  if (attention != null && attention.goal !== undefined) {
    const showsReason = attention.status === "needs_user" || attention.status === "blocked";
    return {
      kind: "held",
      icon: showsReason ? "goal" : "paused",
      chip: HELD_CHIPS[attention.status],
      summary: (showsReason ? attention.reason : undefined) ?? attention.goal,
      objective: attention.goal,
    };
  }
  return goal?.status === "complete" ? "hidden" : null;
}

export const FORK_NEEDS_YOU_PILL = {
  label: "Needs you",
  colorClass: "text-indigo-600 dark:text-indigo-300/90",
  dotClass: "bg-indigo-500 dark:bg-indigo-300/90",
  pulse: false,
} as const;

export interface ForkNeedsYouInput {
  readonly source?: Pick<OrchestrationV2ThreadShell, "forkAttention"> | undefined;
}

export function forkNeedsYou(thread: ForkNeedsYouInput): boolean {
  return threadNeedsYou(thread.source?.forkAttention) && isForkFeatureEnabled("goalStatus");
}
