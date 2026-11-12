import { assert, describe, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";

import type { WorkflowRun } from "../gitHubCli.ts";
import {
  latestRunPerWorkflow,
  WORKFLOW_RUN_NO_RUN_MS,
  WORKFLOW_RUN_WATCH_LIMIT_MS,
  workflowRunWake,
  type WorkflowRunWatchRecord,
} from "./workflowRunRules.ts";

const watch = (overrides: Partial<WorkflowRunWatchRecord> = {}): WorkflowRunWatchRecord => ({
  id: "watch-1",
  threadId: ThreadId.make("thread-1"),
  host: "github.com",
  repository: "acme/app",
  branch: "staging",
  sha: "abcdef1234567890abcdef1234567890abcdef12",
  workflow: null,
  startedAt: 0,
  ...overrides,
});

const run = (
  workflowName: string,
  status: string,
  conclusion = "",
  createdAt = "2026-11-11T10:00:00Z",
): WorkflowRun => ({
  databaseId: workflowName.length,
  workflowName,
  status,
  conclusion,
  url: `https://github.com/acme/app/actions/runs/${workflowName.length}`,
  createdAt,
});

describe("latestRunPerWorkflow", () => {
  it("keeps the newest run of each workflow", () => {
    const older = run("Deploy", "completed", "failure", "2026-11-11T10:00:00Z");
    const newer = run("Deploy", "in_progress", "", "2026-11-11T10:05:00Z");
    const ci = run("CI", "completed", "success");
    assert.deepEqual(latestRunPerWorkflow([older, ci, newer]), [ci, newer]);
  });
});

describe("workflowRunWake", () => {
  it("waits while no run started, then stops after the no-run limit", () => {
    assert.isNull(workflowRunWake(watch(), [], WORKFLOW_RUN_NO_RUN_MS - 1));
    const wake = workflowRunWake(watch({ workflow: "Deploy" }), [], WORKFLOW_RUN_NO_RUN_MS);
    assert.strictEqual(wake?.notification.summary, "Deploy: no workflow run started");
    assert.include(wake?.text ?? "", "call watch_workflow_run again");
  });

  it("waits while any run of the commit is unfinished", () => {
    const runs = [run("CI", "completed", "success"), run("Deploy", "in_progress")];
    assert.isNull(workflowRunWake(watch(), runs, WORKFLOW_RUN_NO_RUN_MS));
    const late = workflowRunWake(watch(), runs, WORKFLOW_RUN_WATCH_LIMIT_MS);
    assert.strictEqual(late?.notification.summary, "staging: still running, stopped watching");
    assert.include(late?.text ?? "", "- Deploy: in_progress");
  });

  it("wakes once every run ended, with each conclusion", () => {
    const passed = workflowRunWake(
      watch(),
      [run("CI", "completed", "success"), run("Lint", "completed", "skipped")],
      1,
    );
    assert.strictEqual(passed?.notification.outcome, "completed");
    assert.strictEqual(passed?.notification.summary, "staging: workflow passed");
    assert.include(passed?.text ?? "", "- CI: success https://github.com/acme/app/actions/runs/2");

    const failed = workflowRunWake(
      watch(),
      [run("CI", "completed", "success"), run("Deploy", "completed", "failure")],
      1,
    );
    assert.strictEqual(failed?.notification.outcome, "failed");
    assert.strictEqual(failed?.notification.summary, "staging: Deploy failed");
    assert.include(failed?.text ?? "", "gh run view <run id> --log-failed --repo acme/app");
  });
});
