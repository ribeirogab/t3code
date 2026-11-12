import type {
  PullRequestCheck,
  PullRequestComment,
  ThreadPullRequestWatch,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import type { evaluatePullRequestWatch } from "../orchestration-v2/pullRequestWatch.ts";
import {
  CHECKS_HOLD_LIMIT_MS,
  conflictNewsPending,
  evaluateBatchedPullRequestWatch,
} from "./pullRequestWatchBatching.ts";

const STARTED = "2026-10-02T12:00:00.000Z";
const NOW = Date.parse(STARTED) + 60_000;
const iso = (at: number) => DateTime.formatIso(DateTime.makeUnsafe(at));

type Detail = Parameters<typeof evaluatePullRequestWatch>[1];

const watch = (overrides: Partial<ThreadPullRequestWatch> = {}): ThreadPullRequestWatch => ({
  startedAt: STARTED,
  headSha: "aaaaaaaaaa",
  failedChecks: [],
  passed: false,
  passedChecks: [],
  remarksThrough: STARTED,
  remarkIds: [],
  conflicting: false,
  wakes: 0,
  ...overrides,
});

const check = (
  name: string,
  status: PullRequestCheck["status"],
  required?: boolean,
): PullRequestCheck => ({
  name,
  status,
  description: null,
  url: `https://github.com/o/r/actions/runs/1/job/${name}`,
  ...(required === undefined ? {} : { required }),
});

const detail = (overrides: Partial<Detail> = {}): Detail => ({
  capabilities: {
    diff: true,
    comment: true,
    actions: [],
    mergeMethods: [],
    search: false,
    review: { inlineComment: false, reply: false, resolve: false, verdicts: [] },
    reviewers: { request: false, listCandidates: false },
    checksAlwaysReport: true,
  },
  headSha: "aaaaaaaaaa",
  checks: [],
  mergeability: "mergeable",
  viewer: "agent-user",
  author: { login: "agent-user", name: null, avatarUrl: null },
  ...overrides,
});

const remark = (createdAt: string): PullRequestComment => ({
  id: `reviewer-${createdAt}`,
  kind: "issue-comment",
  author: { login: "reviewer", name: null, avatarUrl: null },
  body: "Please rename this.",
  createdAt,
  url: "https://github.com/o/r/pull/1#reviewer",
  path: null,
  reviewState: null,
});

const evaluate = (
  current: ThreadPullRequestWatch,
  read: Partial<Detail>,
  options: { readonly now?: number; readonly baseSha?: string | null } = {},
  remarks: ReadonlyArray<PullRequestComment> | null = null,
) =>
  evaluateBatchedPullRequestWatch(
    current,
    detail(read),
    remarks,
    options.now ?? NOW,
    options.baseSha ?? null,
  );

const kinds = (report: ReturnType<typeof evaluate>) => report.changes.map((change) => change.kind);

describe("evaluateBatchedPullRequestWatch", () => {
  it("tells every failure of a head in one wake, once its checks finish", () => {
    const first = evaluate(watch(), {
      checks: [check("lint", "failure"), check("test", "pending"), check("e2e", "pending")],
    });
    assert.deepEqual(first.changes, []);
    assert.deepEqual(first.next.failedChecks, []);
    assert.strictEqual(first.next.checksHeldSince, iso(NOW));

    const second = evaluate(first.next, {
      checks: [check("lint", "failure"), check("test", "failure"), check("e2e", "pending")],
    });
    assert.deepEqual(second.changes, []);

    const finished = evaluate(second.next, {
      checks: [check("lint", "failure"), check("test", "failure"), check("e2e", "success")],
    });
    assert.deepEqual(finished.changes, [
      {
        kind: "checks-failed",
        failed: [check("lint", "failure"), check("test", "failure")],
      },
    ]);
    assert.isUndefined(finished.next.checksHeldSince);

    const again = evaluate(finished.next, {
      checks: [check("lint", "failure"), check("test", "failure"), check("e2e", "success")],
    });
    assert.deepEqual(again.changes, []);
  });

  it("holds an early required pass until every check finishes", () => {
    const early = evaluate(watch(), {
      checks: [check("build", "success", true), check("e2e", "pending", false)],
    });
    assert.deepEqual(early.changes, []);
    assert.isFalse(early.next.passed);

    const finished = evaluate(early.next, {
      checks: [check("build", "success", true), check("e2e", "success", false)],
    });
    assert.deepEqual(kinds(finished), ["checks-passed"]);
    assert.deepEqual(finished.next.owedChecks, []);
  });

  it("tells a rerun's result on the same head", () => {
    const told = watch({ failedChecks: ["test"] });
    const rerun = evaluate(told, {
      checks: [check("lint", "success"), check("test", "pending")],
    });
    assert.deepEqual(rerun.changes, []);
    assert.deepEqual(rerun.next.failedChecks, []);

    const failedAgain = evaluate(rerun.next, {
      checks: [check("lint", "success"), check("test", "failure")],
    });
    assert.deepEqual(kinds(failedAgain), ["checks-failed"]);

    const passedRerun = evaluate(watch({ passed: true, passedChecks: ["lint", "test"] }), {
      checks: [check("lint", "success"), check("test", "pending")],
    });
    assert.isFalse(passedRerun.next.passed);
    const passedAgain = evaluate(passedRerun.next, {
      checks: [check("lint", "success"), check("test", "success")],
    });
    assert.deepEqual(kinds(passedAgain), ["checks-passed"]);
  });

  it("tells held failures once a check stays pending past the hold limit", () => {
    const checks = [check("lint", "failure"), check("deploy", "pending")];
    const held = evaluate(watch(), { checks });
    const late = evaluate(held.next, { checks }, { now: NOW + CHECKS_HOLD_LIMIT_MS });
    assert.deepEqual(kinds(late), ["checks-failed"]);
    assert.strictEqual(late.next.checksHeldSince, held.next.checksHeldSince);
  });

  it("starts the hold again on a new head", () => {
    const pushedAt = NOW + CHECKS_HOLD_LIMIT_MS;
    const report = evaluate(
      watch({ checksHeldSince: STARTED }),
      { headSha: "bbbbbbbbbb", checks: [check("lint", "failure"), check("test", "pending")] },
      { now: pushedAt },
    );
    assert.deepEqual(report.changes, []);
    assert.strictEqual(report.next.checksHeldSince, iso(pushedAt));
  });

  it("does not start the no-checks clock while checks run", () => {
    const report = evaluate(
      watch({ checksAwaitedSince: STARTED }),
      { checks: [check("lint", "pending")] },
      { now: NOW + 20 * 60_000 },
    );
    assert.deepEqual(report.changes, []);
    assert.isNull(report.next.checksAwaitedSince);
  });

  it("still wakes for comments while checks run", () => {
    const report = evaluate(
      watch(),
      { checks: [check("lint", "failure"), check("test", "pending")] },
      {},
      [remark("2026-10-02T12:00:30.000Z")],
    );
    assert.deepEqual(kinds(report), ["remarks"]);
    assert.strictEqual(report.next.wakes, 1);
  });

  it("wakes for a conflict once per base SHA", () => {
    const first = evaluate(watch(), { mergeability: "conflicting" }, { baseSha: "base-one" });
    assert.deepEqual(kinds(first), ["conflicting"]);
    assert.strictEqual(first.next.conflictBaseSha, "base-one");

    const pushed = evaluate(
      first.next,
      { headSha: "bbbbbbbbbb", mergeability: "conflicting" },
      { baseSha: "base-one" },
    );
    assert.deepEqual(pushed.changes, []);
    assert.isTrue(pushed.next.conflicting);
    assert.strictEqual(pushed.next.conflictBaseSha, "base-one");

    const cleared = evaluate(pushed.next, { headSha: "bbbbbbbbbb", mergeability: "mergeable" });
    const back = evaluate(
      cleared.next,
      { headSha: "bbbbbbbbbb", mergeability: "conflicting" },
      { baseSha: "base-one" },
    );
    assert.deepEqual(back.changes, []);

    const baseMoved = evaluate(
      back.next,
      { headSha: "cccccccccc", mergeability: "conflicting" },
      { baseSha: "base-two" },
    );
    assert.deepEqual(kinds(baseMoved), ["conflicting"]);
    assert.strictEqual(baseMoved.next.conflictBaseSha, "base-two");
  });

  it("tells a conflict on each push when the base SHA is unknown", () => {
    const told = watch({ conflicting: true, conflictBaseSha: "base-one" });
    const pushed = evaluate(told, { headSha: "bbbbbbbbbb", mergeability: "conflicting" });
    assert.deepEqual(kinds(pushed), ["conflicting"]);
    assert.strictEqual(pushed.next.conflictBaseSha, "base-one");
  });
});

describe("conflictNewsPending", () => {
  const cases: ReadonlyArray<
    readonly [string, Partial<ThreadPullRequestWatch>, Partial<Detail>, boolean]
  > = [
    ["a new conflict", {}, { mergeability: "conflicting" }, true],
    [
      "a told conflict on the same head",
      { conflicting: true },
      { mergeability: "conflicting" },
      false,
    ],
    [
      "a told conflict after a push",
      { conflicting: true },
      { headSha: "bbbbbbbbbb", mergeability: "conflicting" },
      true,
    ],
    ["a clean branch", {}, { mergeability: "mergeable" }, false],
  ];
  it.each(cases)("%s", (_name, told, read, expected) => {
    assert.strictEqual(conflictNewsPending(watch(told), detail(read)), expected);
  });
});
