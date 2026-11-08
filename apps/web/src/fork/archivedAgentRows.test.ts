import { describe, expect, it } from "vite-plus/test";
import { ThreadId } from "@t3tools/contracts";
import {
  deriveThreadRelationshipGraph,
  immediateThreadRelationships,
} from "@t3tools/client-runtime/state/thread-relationships";

import { withoutArchivedAgentRows } from "./archivedAgentRows";

const parent = ThreadId.make("parent");
const liveChild = ThreadId.make("live-child");
const archivedChild = ThreadId.make("archived-child");
const archivedAt = "2026-11-08T12:00:00.000Z";

function graphWith(parentArchivedAt: string | null) {
  return deriveThreadRelationshipGraph({
    threads: [
      { id: parent, archivedAt: parentArchivedAt, lineage: { parentThreadId: null } },
      {
        id: liveChild,
        archivedAt: null,
        lineage: { parentThreadId: parent, relationshipToParent: "subagent" },
      },
      {
        id: archivedChild,
        archivedAt,
        lineage: { parentThreadId: parent, relationshipToParent: "subagent" },
      },
    ] as never,
    projection: null,
  });
}

function visibleIds(graph: ReturnType<typeof graphWith>, currentThreadId: ThreadId) {
  return withoutArchivedAgentRows(
    immediateThreadRelationships(graph, currentThreadId),
    graph,
    currentThreadId,
  ).map((row) => row.threadId);
}

describe("withoutArchivedAgentRows", () => {
  it("drops archived agent children and keeps live ones", () => {
    expect(visibleIds(graphWith(null), parent)).toEqual([liveChild]);
  });

  it("keeps an archived parent reachable from its child", () => {
    expect(visibleIds(graphWith(archivedAt), liveChild)).toEqual([parent]);
  });
});
