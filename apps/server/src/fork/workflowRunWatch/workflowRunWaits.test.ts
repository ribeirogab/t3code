import { assert, describe, it } from "@effect/vitest";
import {
  overrideForkFeatureSettings,
  RunId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";

import { publishWorkflowRunWaits, withWorkflowRunWaits } from "./workflowRunWaits.ts";

const threadId = ThreadId.make("thread-1");

const shell = (
  overrides: Partial<
    Pick<OrchestrationV2ThreadShell, "activeRunId" | "activityRunStatus" | "status">
  > = {},
) => ({
  id: threadId,
  activeRunId: null,
  activityRunStatus: null,
  status: "completed" as OrchestrationV2ThreadShell["status"],
  pendingBackgroundTasks: [],
  ...overrides,
});

describe("withWorkflowRunWaits", () => {
  it("holds a settled shell on its workflow run watch, and nothing else", () => {
    publishWorkflowRunWaits([{ threadId, watchId: "watch-1", label: "CI run 3458" }]);
    assert.deepEqual(withWorkflowRunWaits(shell()).pendingBackgroundTasks, [
      {
        taskId: "fork-workflow-run:watch-1",
        description: "CI run 3458",
        kind: "background_task",
        awaited: true,
      },
    ]);
    const running = shell({ activeRunId: RunId.make("run-1"), status: "running" });
    assert.strictEqual(withWorkflowRunWaits(running), running);
    const other = { ...shell(), id: ThreadId.make("thread-2") };
    assert.strictEqual(withWorkflowRunWaits(other), other);
    const appThread = { id: threadId, status: "completed" };
    assert.strictEqual(withWorkflowRunWaits(appThread), appThread);
    {
      using _settings = overrideForkFeatureSettings({ features: { waitingDetail: false } });
      const settled = shell();
      assert.strictEqual(withWorkflowRunWaits(settled), settled);
    }
    publishWorkflowRunWaits([]);
    const ended = shell();
    assert.strictEqual(withWorkflowRunWaits(ended), ended);
  });
});
