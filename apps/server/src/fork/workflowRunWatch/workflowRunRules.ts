import { type OrchestrationV2Notification, ThreadId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import type { WorkflowRun } from "../gitHubCli.ts";

export const WORKFLOW_RUN_NO_RUN_MS = 15 * 60_000;
export const WORKFLOW_RUN_WATCH_LIMIT_MS = 6 * 60 * 60_000;
export const WORKFLOW_RUN_READ_FAILURE_LIMIT = 10;

const PASSING_CONCLUSIONS = new Set(["success", "skipped", "neutral"]);

const WorkflowRunWatchRecord = Schema.Struct({
  id: Schema.String,
  threadId: ThreadId,
  host: Schema.String,
  repository: Schema.String,
  branch: Schema.String,
  sha: Schema.String,
  workflow: Schema.NullOr(Schema.String),
  startedAt: Schema.Number,
});
export type WorkflowRunWatchRecord = typeof WorkflowRunWatchRecord.Type;

export const WorkflowRunWatchesFile = Schema.Struct({
  watches: Schema.Array(WorkflowRunWatchRecord),
});

export interface WorkflowRunWake {
  readonly text: string;
  readonly notification: OrchestrationV2Notification;
}

export const sameWatchTarget = (left: WorkflowRunWatchRecord, right: WorkflowRunWatchRecord) =>
  left.threadId === right.threadId &&
  left.host === right.host &&
  left.repository.toLowerCase() === right.repository.toLowerCase() &&
  left.branch === right.branch &&
  left.workflow === right.workflow;

export function latestRunPerWorkflow(runs: ReadonlyArray<WorkflowRun>): ReadonlyArray<WorkflowRun> {
  const latest = new Map<string, WorkflowRun>();
  for (const run of runs) {
    const known = latest.get(run.workflowName);
    if (known === undefined || run.createdAt > known.createdAt) latest.set(run.workflowName, run);
  }
  return [...latest.values()].toSorted((left, right) =>
    left.workflowName.localeCompare(right.workflowName),
  );
}

const runsOf = (watch: WorkflowRunWatchRecord) =>
  `${watch.workflow === null ? "workflow runs" : `${watch.workflow} run`} for ${watch.branch} at ${watch.sha.slice(0, 7)} in ${watch.repository}`;

const labelOf = (watch: WorkflowRunWatchRecord) => watch.workflow ?? watch.branch;

const runLine = (run: WorkflowRun) =>
  `- ${run.workflowName}: ${run.status === "completed" ? run.conclusion || "completed" : run.status} ${run.url}`;

const passed = (run: WorkflowRun) => PASSING_CONCLUSIONS.has(run.conclusion);

function finishedWake(
  watch: WorkflowRunWatchRecord,
  runs: ReadonlyArray<WorkflowRun>,
): WorkflowRunWake {
  const failed = runs.filter((run) => !passed(run));
  return {
    text: [
      `The ${runsOf(watch)} ended. T3 Code was watching them for you:`,
      ...runs.map(runLine),
      "",
      failed.length === 0
        ? "The watch has ended. Act on the result as your task requires."
        : `The watch has ended. Read a failed run's log with \`gh run view <run id> --log-failed --repo ${watch.repository}\`, then act on it as your task requires.`,
    ].join("\n"),
    notification: {
      source: { kind: "monitor" },
      outcome: failed.length === 0 ? "completed" : "failed",
      summary: `${labelOf(watch)}: ${
        failed.length === 0
          ? "workflow passed"
          : `${failed.map((run) => run.workflowName).join(", ")} failed`
      }`,
    },
  };
}

const noRunWake = (watch: WorkflowRunWatchRecord): WorkflowRunWake => ({
  text: `No GitHub Actions run started for ${watch.branch} at ${watch.sha.slice(0, 7)} in ${watch.repository}${watch.workflow === null ? "" : ` for ${watch.workflow}`} within ${WORKFLOW_RUN_NO_RUN_MS / 60_000} minutes, so T3 Code stopped watching. Check that the workflow runs on this branch, and call watch_workflow_run again after the next push.`,
  notification: {
    source: { kind: "monitor" },
    outcome: "updated",
    summary: `${labelOf(watch)}: no workflow run started`,
  },
});

const tooLongWake = (
  watch: WorkflowRunWatchRecord,
  runs: ReadonlyArray<WorkflowRun>,
): WorkflowRunWake => ({
  text: [
    `The ${runsOf(watch)} did not end within ${WORKFLOW_RUN_WATCH_LIMIT_MS / 3_600_000} hours, so T3 Code stopped watching:`,
    ...runs.map(runLine),
    "",
    "Check the runs yourself.",
  ].join("\n"),
  notification: {
    source: { kind: "monitor" },
    outcome: "updated",
    summary: `${labelOf(watch)}: still running, stopped watching`,
  },
});

export const unreadableWake = (watch: WorkflowRunWatchRecord, detail: string): WorkflowRunWake => ({
  text: `T3 Code stopped watching the ${runsOf(watch)} because it failed to read them ${WORKFLOW_RUN_READ_FAILURE_LIMIT} times in a row: ${detail}`,
  notification: {
    source: { kind: "monitor" },
    outcome: "failed",
    summary: `${labelOf(watch)}: stopped watching, could not read runs`,
  },
});

export function workflowRunWake(
  watch: WorkflowRunWatchRecord,
  runs: ReadonlyArray<WorkflowRun>,
  now: number,
): WorkflowRunWake | null {
  const latest = latestRunPerWorkflow(runs);
  const age = now - watch.startedAt;
  if (latest.length === 0) return age >= WORKFLOW_RUN_NO_RUN_MS ? noRunWake(watch) : null;
  if (latest.some((run) => run.status !== "completed")) {
    return age >= WORKFLOW_RUN_WATCH_LIMIT_MS ? tooLongWake(watch, latest) : null;
  }
  return finishedWake(watch, latest);
}
