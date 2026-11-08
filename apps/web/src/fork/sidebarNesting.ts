import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  isListedThreadLineage,
  type EnvironmentId,
  type OrchestrationV2AppThreadLineage,
  type ThreadId,
} from "@t3tools/contracts";

const NESTED_MAX_INDENT = 3;

export interface NestingThread {
  readonly id: ThreadId;
  readonly environmentId: EnvironmentId;
  readonly archivedAt: string | null;
  readonly lineage: OrchestrationV2AppThreadLineage;
}

export interface SidebarNesting<T extends NestingThread> {
  readonly roots: readonly T[];
  readonly childrenByKey: ReadonlyMap<string, readonly T[]>;
}

export interface NestedGuide {
  readonly level: number;
  readonly elbow: boolean;
  readonly end: boolean;
}

export type NestedSidebarEntry<T extends NestingThread> =
  | {
      readonly kind: "thread";
      readonly key: string;
      readonly parentKey: string;
      readonly thread: T;
      readonly depth: number;
      readonly indent: number;
      readonly descendantCount: number;
      readonly collapsed: boolean;
      readonly guides: readonly NestedGuide[];
    }
  | {
      readonly kind: "summary";
      readonly key: string;
      readonly parentKey: string;
      readonly depth: number;
      readonly indent: number;
      readonly threads: readonly T[];
      readonly guides: readonly NestedGuide[];
    };

export function nestingThreadKey(thread: Pick<NestingThread, "environmentId" | "id">): string {
  return scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
}

function parentKeyOf(thread: NestingThread): string | null {
  const { parentThreadId } = thread.lineage;
  return parentThreadId === null
    ? null
    : nestingThreadKey({ environmentId: thread.environmentId, id: parentThreadId });
}

function hiddenByAncestor(thread: NestingThread, allByKey: ReadonlyMap<string, NestingThread>) {
  const visited = new Set<string>();
  let parentKey = parentKeyOf(thread);
  while (parentKey !== null && !visited.has(parentKey)) {
    visited.add(parentKey);
    const parent = allByKey.get(parentKey);
    if (parent === undefined || parent.archivedAt !== null) return false;
    if (!isListedThreadLineage(parent.lineage)) return true;
    parentKey = parentKeyOf(parent);
  }
  return false;
}

export function buildSidebarNesting<T extends NestingThread>(input: {
  readonly visible: readonly T[];
  readonly all: readonly NestingThread[];
  readonly sort: (threads: readonly T[]) => readonly T[];
}): SidebarNesting<T> {
  const allByKey = new Map(input.all.map((thread) => [nestingThreadKey(thread), thread] as const));
  const inSidebar = input.visible.filter((thread) => !hiddenByAncestor(thread, allByKey));
  const inSidebarKeys = new Set(inSidebar.map(nestingThreadKey));
  const treeParentKey = (thread: T) => {
    const parentKey = parentKeyOf(thread);
    return parentKey !== null && inSidebarKeys.has(parentKey) ? parentKey : null;
  };
  const byKey = new Map(inSidebar.map((thread) => [nestingThreadKey(thread), thread] as const));
  const inCycle = (thread: T) => {
    const start = nestingThreadKey(thread);
    const visited = new Set<string>();
    let key = treeParentKey(thread);
    while (key !== null && !visited.has(key)) {
      if (key === start) return true;
      visited.add(key);
      const parent = byKey.get(key);
      key = parent === undefined ? null : treeParentKey(parent);
    }
    return false;
  };
  const roots: T[] = [];
  const children = new Map<string, T[]>();
  for (const thread of inSidebar) {
    const parentKey = inCycle(thread) ? null : treeParentKey(thread);
    if (parentKey === null) {
      roots.push(thread);
      continue;
    }
    const siblings = children.get(parentKey);
    if (siblings === undefined) children.set(parentKey, [thread]);
    else siblings.push(thread);
  }
  const childrenByKey = new Map<string, readonly T[]>();
  for (const [key, list] of children) childrenByKey.set(key, input.sort(list));
  return { roots, childrenByKey };
}

export function nestedDescendants<T extends NestingThread>(
  nesting: SidebarNesting<T>,
  key: string,
): T[] {
  const result: T[] = [];
  const visit = (parentKey: string) => {
    for (const child of nesting.childrenByKey.get(parentKey) ?? []) {
      result.push(child);
      visit(nestingThreadKey(child));
    }
  };
  visit(key);
  return result;
}

function guidesFor(depths: readonly number[], index: number): NestedGuide[] {
  const depth = depths[index]!;
  const continues = (level: number) => {
    for (let next = index + 1; next < depths.length; next += 1) {
      if (depths[next]! < level) return false;
      if (depths[next] === level) return true;
    }
    return false;
  };
  const guides: NestedGuide[] = [];
  for (let level = 1; level <= depth; level += 1) {
    const last = level === depth;
    const goesOn = continues(level);
    if (!last && !goesOn) continue;
    guides.push({ level: Math.min(level, NESTED_MAX_INDENT), elbow: last, end: last && !goesOn });
  }
  return guides;
}

export function nestedSidebarEntries<T extends NestingThread>(
  nesting: SidebarNesting<T>,
  rootKey: string,
  collapsedKeys: ReadonlySet<string>,
): NestedSidebarEntry<T>[] {
  type Draft =
    | Omit<Extract<NestedSidebarEntry<T>, { kind: "thread" }>, "guides">
    | Omit<Extract<NestedSidebarEntry<T>, { kind: "summary" }>, "guides">;
  const drafts: Draft[] = [];
  const walk = (parentKey: string, depth: number) => {
    if (collapsedKeys.has(parentKey)) {
      const threads = nestedDescendants(nesting, parentKey);
      if (threads.length > 0) {
        drafts.push({
          kind: "summary",
          key: `${parentKey}:nested-summary`,
          parentKey,
          depth,
          indent: Math.min(depth, NESTED_MAX_INDENT),
          threads,
        });
      }
      return;
    }
    for (const child of nesting.childrenByKey.get(parentKey) ?? []) {
      const key = nestingThreadKey(child);
      drafts.push({
        kind: "thread",
        key,
        parentKey,
        thread: child,
        depth,
        indent: Math.min(depth, NESTED_MAX_INDENT),
        descendantCount: nestedDescendants(nesting, key).length,
        collapsed: collapsedKeys.has(key),
      });
      walk(key, depth + 1);
    }
  };
  walk(rootKey, 1);
  const depths = [0, ...drafts.map((draft) => draft.depth)];
  return drafts.map((draft, index) => ({ ...draft, guides: guidesFor(depths, index + 1) }));
}

export function withNestedThreads<T extends NestingThread>(
  nesting: SidebarNesting<T>,
  collapsedKeys: ReadonlySet<string>,
  roots: readonly T[],
): T[] {
  return roots.flatMap((root) => [
    root,
    ...nestedSidebarEntries(nesting, nestingThreadKey(root), collapsedKeys).flatMap((entry) =>
      entry.kind === "thread" ? [entry.thread] : [],
    ),
  ]);
}

export function withAllNestedThreads<T extends NestingThread>(
  nesting: SidebarNesting<T>,
  roots: readonly T[],
): T[] {
  return roots.flatMap((root) => [root, ...nestedDescendants(nesting, nestingThreadKey(root))]);
}

export function nestedRouteRowKey(
  routeRowKey: string | null,
  threads: readonly NestingThread[],
  collapsedKeys: ReadonlySet<string>,
): string | null {
  if (routeRowKey === null) return null;
  const byKey = new Map(threads.map((thread) => [nestingThreadKey(thread), thread] as const));
  const chain: string[] = [];
  let key: string | null = routeRowKey;
  while (key !== null && !chain.includes(key)) {
    const thread = byKey.get(key);
    if (thread === undefined || thread.archivedAt !== null) break;
    chain.push(key);
    key = parentKeyOf(thread);
  }
  for (let index = chain.length - 1; index > 0; index -= 1) {
    const ancestorKey = chain[index]!;
    if (!isListedThreadLineage(byKey.get(ancestorKey)!.lineage)) {
      return chain[index + 1] ?? routeRowKey;
    }
    if (collapsedKeys.has(ancestorKey)) return ancestorKey;
  }
  return routeRowKey;
}
