import { describe, expect, it } from "@effect/vitest";
import { overrideForkFeatureSettings, type ThreadPullRequestWatch } from "@t3tools/contracts";

import {
  pullRequestWatchMessage,
  type PullRequestWatchChange,
} from "../orchestration-v2/pullRequestWatch.ts";
import { conflictNewsResolved } from "./stalePullRequestWakes.ts";

const watch = (conflicting: boolean) =>
  ({ conflicting }) satisfies Pick<ThreadPullRequestWatch, "conflicting">;

const summaryOf = (changes: ReadonlyArray<PullRequestWatchChange>) =>
  pullRequestWatchMessage({
    number: 7,
    url: "https://github.com/acme/app/pull/7",
    baseBranch: "main",
    headSha: "abc1234",
    report: { changes, next: {} as ThreadPullRequestWatch, exhausted: false },
  }).notification.summary;

const conflict: PullRequestWatchChange = { kind: "conflicting" };
const failedChecks: PullRequestWatchChange = { kind: "checks-failed", failed: [] };

describe("conflictNewsResolved", () => {
  it("drops a conflict-only notice once the watch reads the branch as mergeable", () => {
    expect(conflictNewsResolved(watch(false), summaryOf([conflict]))).toBe(true);
  });

  it.each([
    ["the conflict is still there", watch(true), summaryOf([conflict])],
    ["the notice carries other news", watch(false), summaryOf([failedChecks, conflict])],
    ["the notice is about checks", watch(false), summaryOf([failedChecks])],
    ["the notice has no summary", watch(false), undefined],
  ])("keeps the notice when %s", (_case, current, summary) => {
    expect(conflictNewsResolved(current, summary)).toBe(false);
  });

  it.each([
    { master: false, features: {} },
    { master: true, features: { stalePrWakes: false } },
  ])("keeps every notice, as upstream does, with %o", (settings) => {
    using _settings = overrideForkFeatureSettings(settings);
    expect(conflictNewsResolved(watch(false), summaryOf([conflict]))).toBe(false);
  });
});
