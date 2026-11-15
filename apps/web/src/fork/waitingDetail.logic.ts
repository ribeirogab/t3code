import { formatWorkingDurationLabel } from "@t3tools/client-runtime/state/models";
import type { OrchestrationV2PendingBackgroundTask } from "@t3tools/contracts";
import {
  backgroundWorkHoldsCompletion,
  isPullRequestWatchTask,
} from "@t3tools/shared/orchestrationV2PendingBackgroundWork";

import { GOAL_WAITING_TASK_ID } from "./goalWaiting";

const MAX_DETAIL_LENGTH = 24;
const REDUNDANT_WAIT_PREFIX = /^wait(?:ing)?\s+(?:for|on)\s+/i;

export type WaitingLabel = `Waiting · ${string}`;

function shorten(text: string): string {
  return text.length <= MAX_DETAIL_LENGTH
    ? text
    : `${text.slice(0, MAX_DETAIL_LENGTH - 1).trimEnd()}…`;
}

function taskDetail(task: OrchestrationV2PendingBackgroundTask): string | null {
  if (isPullRequestWatchTask(task)) {
    return `PR #${task.taskId.slice(task.taskId.lastIndexOf("#") + 1)} checks`;
  }
  const firstLine = task.description?.split("\n")[0]?.replace(REDUNDANT_WAIT_PREFIX, "").trim();
  return firstLine ? shorten(firstLine) : null;
}

export function waitingLabel(
  tasks: ReadonlyArray<OrchestrationV2PendingBackgroundTask>,
  enabled: boolean,
): WaitingLabel | null {
  if (!enabled) return null;
  const holding = tasks.filter(
    (task) => task.taskId !== GOAL_WAITING_TASK_ID && backgroundWorkHoldsCompletion([task]),
  );
  const detail = holding.map(taskDetail).find((label): label is string => label !== null);
  if (detail === undefined) return null;
  return holding.length > 1 ? `Waiting · ${detail} +${holding.length - 1}` : `Waiting · ${detail}`;
}

export function formatWaitingDuration(elapsedMs: number): string {
  return elapsedMs < 60_000 ? "<1m" : formatWorkingDurationLabel(elapsedMs);
}
