import {
  forkFeatureActive,
  type PullRequestCheck,
  type PullRequestComment,
  type PullRequestDetail,
  type ThreadPullRequestWatch,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import {
  evaluatePullRequestWatch,
  type PullRequestWatchReport,
} from "../orchestration-v2/pullRequestWatch.ts";
import * as GitHubCli from "./gitHubCli.ts";

export const CHECKS_HOLD_LIMIT_MS = 30 * 60_000;

type WatchedDetail = Parameters<typeof evaluatePullRequestWatch>[1];

const isReal = (check: PullRequestCheck) => check.placeholder !== true;
const isRunning = (check: PullRequestCheck) => isReal(check) && check.status === "pending";
const isFailing = (check: PullRequestCheck) =>
  check.status === "failure" || check.status === "cancelled";

const headMoved = (watch: ThreadPullRequestWatch, detail: Pick<WatchedDetail, "headSha">) =>
  (detail.headSha ?? watch.headSha) !== watch.headSha;

export const conflictNewsPending = (
  watch: ThreadPullRequestWatch,
  detail: Pick<WatchedDetail, "headSha" | "mergeability">,
) => detail.mergeability === "conflicting" && (headMoved(watch, detail) || !watch.conflicting);

function checksHeldSince(watch: ThreadPullRequestWatch, detail: WatchedDetail, now: number) {
  if (!detail.checks.some(isRunning)) return undefined;
  const since = headMoved(watch, detail) ? undefined : watch.checksHeldSince;
  return since ?? DateTime.formatIso(DateTime.makeUnsafe(now));
}

const withRunningChecksHidden = (detail: WatchedDetail): WatchedDetail => ({
  ...detail,
  checks: [],
  capabilities: { ...detail.capabilities, checksAlwaysReport: false },
});

function heldCheckState(
  next: ThreadPullRequestWatch,
  detail: WatchedDetail,
): Partial<ThreadPullRequestWatch> {
  const checks = detail.checks.filter(isReal);
  const failing = new Set(checks.filter(isFailing).map((check) => check.name));
  const required = checks.filter((check) => check.required === true);
  const gate = required.length > 0 ? required : checks;
  return {
    failedChecks: next.failedChecks.filter((name) => failing.has(name)),
    checksPending: true,
    ...(gate.some(isRunning) ? { passed: false, passedChecks: [] } : {}),
    ...(detail.capabilities.checksAlwaysReport === true ? { checksAwaitedSince: null } : {}),
  };
}

export function evaluateBatchedPullRequestWatch(
  watch: ThreadPullRequestWatch,
  detail: WatchedDetail,
  remarks: ReadonlyArray<PullRequestComment> | null,
  now: number,
  baseSha: string | null,
): PullRequestWatchReport {
  const heldSince = checksHeldSince(watch, detail, now);
  const holding = heldSince !== undefined && now - Date.parse(heldSince) < CHECKS_HOLD_LIMIT_MS;
  const quietConflict =
    detail.mergeability === "conflicting" && baseSha !== null && baseSha === watch.conflictBaseSha;
  const shaped: WatchedDetail = {
    ...(holding ? withRunningChecksHidden(detail) : detail),
    ...(quietConflict ? { mergeability: "unknown" as const } : {}),
  };
  const report = evaluatePullRequestWatch(watch, shaped, remarks, now);
  const conflictTold =
    baseSha !== null && report.changes.some((change) => change.kind === "conflicting");
  const conflictBaseSha = conflictTold ? baseSha : watch.conflictBaseSha;
  return {
    ...report,
    next: {
      ...report.next,
      ...(holding ? heldCheckState(report.next, detail) : {}),
      ...(quietConflict ? { conflicting: true } : {}),
      ...(conflictBaseSha === undefined ? {} : { conflictBaseSha }),
      ...(heldSince === undefined ? {} : { checksHeldSince: heldSince }),
    },
  };
}

interface ConflictBaseInput {
  readonly detail: Pick<
    PullRequestDetail,
    "provider" | "repository" | "baseBranch" | "headSha" | "mergeability"
  >;
  readonly host: string;
  readonly watches: ReadonlyArray<ThreadPullRequestWatch>;
}

export interface PullRequestWatchEvaluator {
  readonly baseSha: (input: ConflictBaseInput) => Effect.Effect<string | null>;
  readonly evaluate: typeof evaluateBatchedPullRequestWatch;
}

class PullRequestWatchBatching extends Context.Service<
  PullRequestWatchBatching,
  PullRequestWatchEvaluator
>()("t3/fork/pullRequestWatchBatching") {}

const upstreamEvaluator: PullRequestWatchEvaluator = {
  baseSha: () => Effect.succeed(null),
  evaluate: (watch, detail, remarks, now) => evaluatePullRequestWatch(watch, detail, remarks, now),
};

const whenHoldingChecks = (batched: PullRequestWatchEvaluator): PullRequestWatchEvaluator => ({
  baseSha: (input) =>
    forkFeatureActive("holdRunningPrChecks") ? batched.baseSha(input) : Effect.succeed(null),
  evaluate: (...input) =>
    (forkFeatureActive("holdRunningPrChecks") ? batched : upstreamEvaluator).evaluate(...input),
});

export const pullRequestWatchEvaluator = Effect.map(
  Effect.serviceOption(PullRequestWatchBatching),
  Option.match({ onNone: () => upstreamEvaluator, onSome: whenHoldingChecks }),
);

export const layer = Layer.effect(
  PullRequestWatchBatching,
  Effect.gen(function* () {
    const cli = yield* GitHubCli.ForkGitHubCli;
    const baseSha = Effect.fn("PullRequestWatchBatching.baseSha")(function* ({
      detail,
      host,
      watches,
    }: ConflictBaseInput) {
      if (detail.provider !== "github") return null;
      if (!watches.some((watch) => conflictNewsPending(watch, detail))) return null;
      return yield* cli
        .branchHead({ host, repository: detail.repository, branch: detail.baseBranch })
        .pipe(
          Effect.catch((error) =>
            Effect.logDebug("pull request watch could not read the base SHA", { error }).pipe(
              Effect.as(null),
            ),
          ),
        );
    });
    return PullRequestWatchBatching.of({ evaluate: evaluateBatchedPullRequestWatch, baseSha });
  }),
).pipe(Layer.provide(GitHubCli.layer));
