import {
  EnvironmentId,
  isListedThreadLineage,
  ThreadId,
  type OrchestrationV2AppThreadLineage,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildSidebarNesting,
  nestedRouteRowKey,
  nestedSidebarEntries,
  nestingThreadKey,
  withNestedThreads,
  type NestingThread,
} from "./sidebarNesting";

const environmentId = EnvironmentId.make("environment-nesting");

function makeThread(
  id: string,
  lineage: Partial<OrchestrationV2AppThreadLineage> = {},
  archivedAt: string | null = null,
): NestingThread {
  return {
    id: ThreadId.make(id),
    environmentId,
    archivedAt,
    lineage: {
      rootThreadId: ThreadId.make("root"),
      parentThreadId: null,
      relationshipToParent: null,
      ...lineage,
    },
  };
}

function childOf(
  id: string,
  parentId: string,
  lineage: Partial<OrchestrationV2AppThreadLineage> = { listed: true },
): NestingThread {
  return makeThread(id, {
    parentThreadId: ThreadId.make(parentId),
    relationshipToParent: "subagent",
    ...lineage,
  });
}

function nest(all: readonly NestingThread[]) {
  return buildSidebarNesting({
    visible: all.filter(
      (thread) => thread.archivedAt === null && isListedThreadLineage(thread.lineage),
    ),
    all,
    sort: (threads) => threads,
  });
}

const key = (id: string) => nestingThreadKey({ environmentId, id: ThreadId.make(id) });
const ids = (threads: readonly NestingThread[]) => threads.map((thread) => thread.id);

describe("buildSidebarNesting", () => {
  it("nests listed children and lifts broken chains to the top level", () => {
    const nesting = nest([
      makeThread("root"),
      childOf("listed", "root"),
      childOf("fork", "root", { relationshipToParent: "fork" }),
      childOf("grandchild", "listed"),
      childOf("hidden", "root", {}),
      childOf("under-hidden", "hidden"),
      childOf("orphan", "missing"),
      makeThread("archived", {}, "2026-01-01T00:00:00.000Z"),
      childOf("after-archived", "archived"),
      childOf("loop-a", "loop-b"),
      childOf("loop-b", "loop-a"),
    ]);

    expect(ids(nesting.roots)).toEqual(["root", "orphan", "after-archived", "loop-a", "loop-b"]);
    expect(ids(nesting.childrenByKey.get(key("root")) ?? [])).toEqual(["listed", "fork"]);
    expect(ids(nesting.childrenByKey.get(key("listed")) ?? [])).toEqual(["grandchild"]);
    expect(nesting.childrenByKey.has(key("hidden"))).toBe(false);
  });
});

describe("nested sidebar entries", () => {
  const all = [
    makeThread("root"),
    childOf("d1", "root"),
    childOf("d2", "d1"),
    childOf("d3", "d2"),
    childOf("d4", "d3"),
    childOf("s1", "root"),
    childOf("hidden", "root", {}),
    childOf("under-hidden", "hidden"),
  ];
  const nesting = nest(all);

  it("caps the indent at three levels and closes each branch guide", () => {
    const entries = nestedSidebarEntries(nesting, key("root"), new Set());

    expect(
      entries.map((entry) => [
        entry.key,
        entry.depth,
        entry.indent,
        entry.kind === "thread" ? entry.descendantCount : null,
      ]),
    ).toEqual([
      [key("d1"), 1, 1, 3],
      [key("d2"), 2, 2, 2],
      [key("d3"), 3, 3, 1],
      [key("d4"), 4, 3, 0],
      [key("s1"), 1, 1, 0],
    ]);
    expect(entries[3]!.guides).toEqual([
      { level: 1, elbow: false, end: false },
      { level: 3, elbow: true, end: true },
    ]);
    expect(entries[4]!.guides).toEqual([{ level: 1, elbow: true, end: true }]);
  });

  it("summarizes a minimized branch and moves its route row to the minimized parent", () => {
    const collapsed = new Set([key("d2")]);
    const entries = nestedSidebarEntries(nesting, key("root"), collapsed);

    expect(entries.map((entry) => [entry.kind, entry.key])).toEqual([
      ["thread", key("d1")],
      ["thread", key("d2")],
      ["summary", `${key("d2")}:nested-summary`],
      ["thread", key("s1")],
    ]);
    const summary = entries[2]!;
    expect(summary.kind === "summary" && ids(summary.threads)).toEqual(["d3", "d4"]);
    expect(ids(withNestedThreads(nesting, collapsed, nesting.roots))).toEqual([
      "root",
      "d1",
      "d2",
      "s1",
    ]);
    expect(nestedRouteRowKey(key("d4"), all, collapsed)).toBe(key("d2"));
    expect(nestedRouteRowKey(key("d4"), all, new Set([key("root"), key("d2")]))).toBe(key("root"));
    expect(nestedRouteRowKey(key("s1"), all, collapsed)).toBe(key("s1"));
    expect(nestedRouteRowKey(key("under-hidden"), all, new Set())).toBe(key("root"));
  });
});
