import { forkFeatureActive, type ThreadPullRequestWatch } from "@t3tools/contracts";

const CONFLICT_ONLY_SUMMARY = /^#\d+: merge conflict$/;

export function conflictNewsResolved(
  watch: Pick<ThreadPullRequestWatch, "conflicting">,
  summary: string | undefined,
): boolean {
  return (
    forkFeatureActive("stalePrWakes") &&
    !watch.conflicting &&
    summary !== undefined &&
    CONFLICT_ONLY_SUMMARY.test(summary)
  );
}
