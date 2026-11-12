import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { isListedThreadLineage } from "@t3tools/contracts";

type WorktreeThread = Pick<
  EnvironmentThreadShell,
  | "environmentId"
  | "id"
  | "title"
  | "worktreePath"
  | "archivedAt"
  | "deletedAt"
  | "settledAt"
  | "settledOverride"
  | "lineage"
>;

export function threadsSharingWorktree<Thread extends WorktreeThread>(
  self: WorktreeThread,
  threads: ReadonlyArray<Thread>,
): ReadonlyArray<Thread> {
  if (self.worktreePath === null) return [];
  return threads.filter(
    (thread) =>
      thread.environmentId === self.environmentId &&
      thread.worktreePath === self.worktreePath &&
      thread.id !== self.id &&
      thread.archivedAt === null &&
      thread.deletedAt === null &&
      thread.settledAt === null &&
      thread.settledOverride !== "settled" &&
      isListedThreadLineage(thread.lineage),
  );
}

export function sharedWorktreeLabel(count: number): string {
  return `Shared with ${count} ${count === 1 ? "thread" : "threads"}`;
}
