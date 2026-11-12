import { assert, describe, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { ForkGitHubCliError, type WorkflowRun, type WorkflowRunQuery } from "../gitHubCli.ts";
import {
  WORKFLOW_RUN_READ_FAILURE_LIMIT,
  type WorkflowRunWatchRecord,
} from "./workflowRunRules.ts";
import { make, type WorkflowRunWatchesDependencies } from "./WorkflowRunWatches.ts";

const threadId = ThreadId.make("thread-1");
const HEAD = "abcdef1234567890abcdef1234567890abcdef12";

const finished: WorkflowRun = {
  databaseId: 7,
  workflowName: "Deploy",
  status: "completed",
  conclusion: "success",
  url: "https://github.com/acme/app/actions/runs/7",
  createdAt: "2026-11-11T10:00:00Z",
};

function harness(
  options: {
    readonly runs?: () => Effect.Effect<ReadonlyArray<WorkflowRun>, ForkGitHubCliError>;
    readonly watchable?: boolean;
    readonly delivers?: () => boolean;
  } = {},
) {
  const saved: Array<ReadonlyArray<WorkflowRunWatchRecord>> = [];
  const wakes: Array<string> = [];
  const queries: Array<WorkflowRunQuery> = [];
  let ids = 0;
  const deps: WorkflowRunWatchesDependencies = {
    cli: {
      branchHead: () => Effect.succeed(HEAD),
      workflowRuns: (query) => {
        queries.push(query);
        return options.runs?.() ?? Effect.succeed([]);
      },
    },
    store: {
      load: Effect.succeed([]),
      save: (watches) => Effect.sync(() => void saved.push(watches)),
    },
    threadWatchable: () => Effect.succeed(options.watchable ?? true),
    wake: (_record, wake) =>
      Effect.sync(() => {
        wakes.push(wake.notification.summary);
        return options.delivers?.() ?? true;
      }),
    newId: Effect.sync(() => `watch-${++ids}`),
  };
  return { deps, saved, wakes, queries };
}

const input = {
  threadId,
  host: "github.com",
  repository: "acme/app",
  branch: "staging",
  workflow: "Deploy",
  sha: null,
};

describe("WorkflowRunWatches", () => {
  it.effect("watches the branch head and replaces a watch of the same target", () =>
    Effect.gen(function* () {
      const { deps, saved, queries } = harness();
      const watches = yield* make(deps);
      const first = yield* watches.watch(input);
      assert.strictEqual(first.sha, HEAD);
      assert.strictEqual(queries[0]?.workflow, "Deploy");
      yield* watches.watch({ ...input, sha: "1234567890abcdef1234567890abcdef12345678" });
      assert.deepEqual(
        saved.at(-1)?.map((watch) => watch.sha),
        ["1234567890abcdef1234567890abcdef12345678"],
      );
    }),
  );

  it.effect("wakes once when the runs end and forgets the watch", () =>
    Effect.gen(function* () {
      let runs: ReadonlyArray<WorkflowRun> = [
        { ...finished, status: "in_progress", conclusion: "" },
      ];
      const { deps, saved, wakes } = harness({ runs: () => Effect.succeed(runs) });
      const watches = yield* make(deps);
      yield* watches.watch(input);
      yield* watches.sweep;
      assert.deepEqual(wakes, []);
      runs = [finished];
      yield* watches.sweep;
      yield* watches.sweep;
      assert.deepEqual(wakes, ["Deploy: workflow passed"]);
      assert.deepEqual(saved.at(-1), []);
    }),
  );

  it.effect("drops a watch whose thread was archived without waking it", () =>
    Effect.gen(function* () {
      const { deps, saved, wakes } = harness({ watchable: false });
      const watches = yield* make(deps);
      yield* watches.watch(input);
      yield* watches.sweep;
      assert.deepEqual(wakes, []);
      assert.deepEqual(saved.at(-1), []);
    }),
  );

  it.effect("stops after repeated read failures and says why", () =>
    Effect.gen(function* () {
      let failing = false;
      const { deps, wakes } = harness({
        runs: () =>
          failing
            ? Effect.fail(new ForkGitHubCliError({ detail: "gh run list failed: HTTP 502" }))
            : Effect.succeed([]),
      });
      const watches = yield* make(deps);
      yield* watches.watch(input);
      failing = true;
      for (let read = 1; read < WORKFLOW_RUN_READ_FAILURE_LIMIT; read++) yield* watches.sweep;
      assert.deepEqual(wakes, []);
      yield* watches.sweep;
      assert.deepEqual(wakes, ["Deploy: stopped watching, could not read runs"]);
    }),
  );

  it.effect("keeps a watch whose wake was not delivered and retries it", () =>
    Effect.gen(function* () {
      let delivered = false;
      const { deps, wakes, saved } = harness({
        runs: () => Effect.succeed([finished]),
        delivers: () => delivered,
      });
      const watches = yield* make(deps);
      yield* watches.watch(input);
      yield* watches.sweep;
      assert.lengthOf(saved.at(-1) ?? [], 1);
      delivered = true;
      yield* watches.sweep;
      assert.deepEqual(wakes, ["Deploy: workflow passed", "Deploy: workflow passed"]);
      assert.deepEqual(saved.at(-1), []);
    }),
  );

  it.effect("stop removes the thread's watches of that branch", () =>
    Effect.gen(function* () {
      const { deps, saved } = harness();
      const watches = yield* make(deps);
      yield* watches.watch(input);
      yield* watches.watch({ ...input, branch: "main" });
      assert.strictEqual(yield* watches.stop({ threadId, branch: "staging", workflow: null }), 1);
      assert.deepEqual(
        saved.at(-1)?.map((watch) => watch.branch),
        ["main"],
      );
    }),
  );
});
