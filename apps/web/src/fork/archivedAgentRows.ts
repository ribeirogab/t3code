import {
  isParentThreadRelationship,
  type ThreadRelationshipEdge,
  type ThreadRelationshipGraph,
} from "@t3tools/client-runtime/state/thread-relationships";
import type { ThreadId } from "@t3tools/contracts";

import { useForkFeature } from "./forkFeatures";

export function withoutArchivedAgentRows<
  Row extends { readonly threadId: ThreadId; readonly edge: ThreadRelationshipEdge },
>(rows: ReadonlyArray<Row>, graph: ThreadRelationshipGraph, currentThreadId: ThreadId): Row[] {
  return rows.filter(
    ({ threadId, edge }) =>
      edge.kind !== "subagent" ||
      isParentThreadRelationship(edge, currentThreadId) ||
      (graph.nodes.get(threadId)?.thread?.archivedAt ?? null) === null,
  );
}

export function useWithoutArchivedAgentRows<
  Row extends { readonly threadId: ThreadId; readonly edge: ThreadRelationshipEdge },
>(rows: Row[], graph: ThreadRelationshipGraph, currentThreadId: ThreadId): Row[] {
  const enabled = useForkFeature("hideArchivedAgents");
  return enabled ? withoutArchivedAgentRows(rows, graph, currentThreadId) : rows;
}
