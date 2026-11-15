import type { OrchestrationV2PendingBackgroundTask } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { GOAL_WAITING_TASK_ID } from "./goalWaiting";
import { waitingLabel } from "./waitingDetail.logic";

const pullRequestWatch: OrchestrationV2PendingBackgroundTask = {
  taskId: "pull-request-watch:github.com/acme/app#57",
  description: "Watching pull request #57",
  kind: "monitor",
  awaited: true,
};
const workflowRunWatch: OrchestrationV2PendingBackgroundTask = {
  taskId: "fork-workflow-run:watch-1",
  description: "CI run 3458",
  kind: "background_task",
  awaited: true,
};
const describedCommand: OrchestrationV2PendingBackgroundTask = {
  taskId: "bash-1",
  description: "Wait for the staging deploy",
  kind: "command",
  awaited: true,
};
const undescribedCommand: OrchestrationV2PendingBackgroundTask = {
  taskId: "bash-2",
  kind: "command",
  awaited: true,
};
const devServer: OrchestrationV2PendingBackgroundTask = {
  taskId: "bash-3",
  description: "Start the dev server",
  kind: "command",
};
const child: OrchestrationV2PendingBackgroundTask = {
  taskId: "agent-1",
  description: "Review the checkout flow end to end\nand report",
  kind: "subagent",
};
const goal: OrchestrationV2PendingBackgroundTask = {
  taskId: GOAL_WAITING_TASK_ID,
  description: "Pursuing goal",
  kind: "background_task",
  awaited: true,
};

describe("waitingLabel", () => {
  it.each([
    ["a pull request watch", [pullRequestWatch], "Waiting · PR #57 checks"],
    ["a workflow run watch", [workflowRunWatch], "Waiting · CI run 3458"],
    ["a described background command", [describedCommand], "Waiting · the staging deploy"],
    ["a command without description", [undescribedCommand], null],
    ["a waited-on child", [child], "Waiting · Review the checkout flo…"],
    ["work that holds nothing", [devServer], null],
    ["only the goal", [goal], null],
    [
      "several waits",
      [goal, devServer, undescribedCommand, workflowRunWatch],
      "Waiting · CI run 3458 +1",
    ],
  ])("labels %s", (_case, tasks, expected) => {
    expect(waitingLabel(tasks, true)).toBe(expected);
  });

  it("keeps the upstream label with the toggle off", () => {
    expect(waitingLabel([pullRequestWatch, workflowRunWatch], false)).toBeNull();
  });
});
