import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { isListedThreadLineage, type CommandId, type ScopedThreadRef } from "@t3tools/contracts";

export type NestedRemovalChoice = "cancel" | "all" | "this" | "none";

export interface NestedRemoval {
  readonly choice: NestedRemovalChoice;
  readonly descendants: readonly ScopedThreadRef[];
  readonly archiveBatchId: CommandId;
}

export function sidebarDescendantRefs(
  threads: readonly EnvironmentThreadShell[],
  parent: ScopedThreadRef,
): ScopedThreadRef[] {
  const childrenByParentKey = new Map<string, EnvironmentThreadShell[]>();
  for (const thread of threads) {
    const { parentThreadId } = thread.lineage;
    if (parentThreadId === null || thread.archivedAt !== null) continue;
    if (!isListedThreadLineage(thread.lineage)) continue;
    const key = scopedThreadKey(scopeThreadRef(thread.environmentId, parentThreadId));
    childrenByParentKey.set(key, [...(childrenByParentKey.get(key) ?? []), thread]);
  }
  const result: ScopedThreadRef[] = [];
  const seen = new Set<string>([scopedThreadKey(parent)]);
  const visit = (key: string) => {
    for (const child of childrenByParentKey.get(key) ?? []) {
      const ref = scopeThreadRef(child.environmentId, child.id);
      const childKey = scopedThreadKey(ref);
      if (seen.has(childKey)) continue;
      seen.add(childKey);
      result.push(ref);
      visit(childKey);
    }
  };
  visit(scopedThreadKey(parent));
  return result;
}

type CommandResult = { readonly _tag: "Success" | "Failure" };

async function removeThreadBranch<Result extends CommandResult>(
  nested: NestedRemoval,
  parent: ScopedThreadRef,
  remove: (ref: ScopedThreadRef, batch: RemovalBatch) => Promise<Result>,
): Promise<Result> {
  const batch: RemovalBatch = {
    archiveBatchId: nested.archiveBatchId,
    deletedThreadKeys: new Set(),
  };
  let firstFailure: Result | null = null;
  for (const ref of nested.descendants.toReversed()) {
    const result = await remove(ref, batch);
    if (result._tag === "Failure") firstFailure ??= result;
    else batch.deletedThreadKeys.add(scopedThreadKey(ref));
  }
  const parentResult = await remove(parent, batch);
  return firstFailure ?? parentResult;
}

export interface RemovalBatch {
  readonly archiveBatchId: CommandId;
  readonly deletedThreadKeys: Set<string>;
}

export function archiveBatchMates(
  snapshots: readonly {
    readonly environmentId: ScopedThreadRef["environmentId"];
    readonly snapshot: {
      readonly threads: readonly {
        readonly id: ScopedThreadRef["threadId"];
        readonly archiveBatchId?: CommandId | null | undefined;
      }[];
    };
  }[],
  target: ScopedThreadRef,
): ScopedThreadRef[] {
  const threads = snapshots.flatMap(({ environmentId, snapshot }) =>
    snapshot.threads.map((thread) => ({ environmentId, thread })),
  );
  const batchId = threads.find(
    ({ environmentId, thread }) =>
      environmentId === target.environmentId && thread.id === target.threadId,
  )?.thread.archiveBatchId;
  if (batchId == null) return [];
  return threads
    .filter(
      ({ environmentId, thread }) =>
        thread.archiveBatchId === batchId &&
        !(environmentId === target.environmentId && thread.id === target.threadId),
    )
    .map(({ environmentId, thread }) => scopeThreadRef(environmentId, thread.id));
}

export async function unarchiveWithBatch<Result>(
  target: ScopedThreadRef,
  mates: readonly ScopedThreadRef[],
  unarchive: (ref: ScopedThreadRef) => Promise<Result>,
): Promise<Result> {
  const result = await unarchive(target);
  for (const mate of mates) await unarchive(mate);
  return result;
}

export function removeWithNested<Result extends CommandResult>(
  nested: NestedRemoval,
  threadRef: ScopedThreadRef,
  remove: (ref: ScopedThreadRef, batch: Partial<RemovalBatch>) => Promise<Result>,
): Promise<Result> {
  return nested.choice === "all"
    ? removeThreadBranch(nested, threadRef, remove)
    : remove(threadRef, {});
}
