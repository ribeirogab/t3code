import { assert, describe, it } from "@effect/vitest";
import { overrideForkFeatureSettings, OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import {
  forkToolVisible,
  inactiveForkAction,
  withForkToolGates,
  withoutInactiveForkParameters,
} from "./forkToolGates.ts";
import { delegatedTaskThreadId } from "./threadIdResolver.ts";

const delegation = { task: "Review", listed: true, notifyParent: "never", goal: "Ship it" };

describe("forkToolVisible", () => {
  it("lists each fork tool only while its feature is on", () => {
    const forkTools = [
      ["t3_thread_handoff", "continueInNewThread"],
      ["publish_port", "publishedPorts"],
      ["unpublish_port", "publishedPorts"],
      ["watch_workflow_run", "workflowRunWatch"],
    ] as const;
    for (const [tool, feature] of forkTools) {
      assert.isTrue(forkToolVisible(tool));
      using _feature = overrideForkFeatureSettings({ features: { [feature]: false } });
      assert.isFalse(forkToolVisible(tool), tool);
    }
    using _master = overrideForkFeatureSettings({ master: false });
    assert.isTrue(forkToolVisible("delegate_task"));
    assert.isFalse(forkToolVisible("publish_port"));
  });
});

const kept = (toolName: string, params: object): unknown =>
  withoutInactiveForkParameters(toolName, params);

describe("withoutInactiveForkParameters", () => {
  it("keeps the fork parameters while their features are on", () => {
    assert.strictEqual(withoutInactiveForkParameters("delegate_task", delegation), delegation);
  });

  it("drops each fork parameter whose feature is off, as upstream ignores it", () => {
    {
      using _settings = overrideForkFeatureSettings({
        features: { nestedThreads: false, goalOnNewThreads: false },
      });
      assert.deepEqual(kept("delegate_task", delegation), {
        task: "Review",
        notifyParent: "never",
      });
      assert.deepEqual(kept("t3_thread_launch", { goal: "Ship it" }), {});
    }
    using _master = overrideForkFeatureSettings({ master: false });
    assert.deepEqual(kept("delegate_task", delegation), {
      task: "Review",
    });
  });
});

describe("inactiveForkAction", () => {
  it("refuses set_listed only while Nested threads is off", () => {
    const setListed = { action: "set_listed", listed: true };
    assert.isNull(inactiveForkAction("t3_thread_update", setListed));
    using _settings = overrideForkFeatureSettings({ features: { nestedThreads: false } });
    assert.instanceOf(inactiveForkAction("t3_thread_update", setListed), OrchestratorMcpFailure);
    assert.isNull(inactiveForkAction("t3_thread_update", { action: "rename", title: "New" }));
  });
});

describe("withForkToolGates", () => {
  const delegatedId = "thread:delegated-task:mcp:delegate:thread:parent:1";

  it.effect("resolves thread ids only while Fork features is on", () =>
    Effect.gen(function* () {
      const candidate = delegatedTaskThreadId(delegatedId);
      assert.isNotNull(candidate);
      const seen: Array<unknown> = [];
      const gated = withForkToolGates({
        delegate_task: (params: object) => Effect.sync(() => seen.push(params)),
        t3_thread_read: (params: object) => Effect.sync(() => seen.push(params)),
      });
      const threads = {
        getThreadShell: (threadId: string) =>
          Effect.succeed(threadId === candidate ? { deletedAt: null } : null),
      } as unknown as ThreadManagement.ThreadManagementService["Service"];
      const read = gated
        .t3_thread_read({ threadId: delegatedId })
        .pipe(Effect.provideService(ThreadManagement.ThreadManagementService, threads));
      yield* read;
      using _master = overrideForkFeatureSettings({ master: false });
      yield* read;
      yield* gated.delegate_task(delegation);
      assert.deepEqual(seen, [
        { threadId: candidate },
        { threadId: delegatedId },
        { task: "Review" },
      ]);
    }),
  );

  it.effect("fails set_listed before the handler runs while Nested threads is off", () =>
    Effect.gen(function* () {
      let called = false;
      const gated = withForkToolGates({
        t3_thread_update: (_params: object) =>
          Effect.sync(() => {
            called = true;
          }),
      });
      using _settings = overrideForkFeatureSettings({ features: { nestedThreads: false } });
      const failure = yield* gated
        .t3_thread_update({ action: "set_listed", listed: false })
        .pipe(Effect.flip);
      assert.instanceOf(failure, OrchestratorMcpFailure);
      assert.isFalse(called);
    }),
  );
});
