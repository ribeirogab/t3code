import {
  forkFeatureActive,
  isListedThreadLineage,
  type OrchestrationV2AppThread,
  type OrchestrationV2AppThreadLineage,
} from "@t3tools/contracts";
import type * as SqlClient from "effect/sql/SqlClient";

type LineageHolder = Pick<OrchestrationV2AppThread, "lineage">;

interface NestingUpdate {
  readonly listed?: boolean | undefined;
  readonly detached?: true | undefined;
}

export function isUnlistedSubagentLineage(
  lineage: Pick<OrchestrationV2AppThreadLineage, "relationshipToParent" | "listed">,
): boolean {
  return (
    lineage.relationshipToParent === "subagent" &&
    (!forkFeatureActive("nestedThreads") || lineage.listed !== true)
  );
}

export function isNestedListedChild(lineage: OrchestrationV2AppThreadLineage): boolean {
  return (
    forkFeatureActive("nestedThreads") &&
    lineage.parentThreadId !== null &&
    !isUnlistedSubagentLineage(lineage)
  );
}

export function skipsHiddenChildAncestors(lineage: OrchestrationV2AppThreadLineage): boolean {
  return forkFeatureActive("nestedThreads")
    ? lineage.parentThreadId === null
    : isListedThreadLineage(lineage);
}

export function listedThreadsFilter(sql: SqlClient.SqlClient) {
  return forkFeatureActive("nestedThreads")
    ? sql`json_extract(t.payload_json, '$.lineage.sideChat') IS NOT 1
          AND COALESCE(
            json_extract(t.payload_json, '$.lineage.listed'),
            json_extract(t.payload_json, '$.lineage.relationshipToParent') IS NOT 'subagent'
          ) = 1`
    : sql`json_extract(t.payload_json, '$.lineage.relationshipToParent') IS NOT 'subagent'
          AND json_extract(t.payload_json, '$.lineage.sideChat') IS NOT 1`;
}

function isNestedLineage(lineage: OrchestrationV2AppThreadLineage): boolean {
  return lineage.parentThreadId !== null && lineage.sideChat !== true && lineage.detached !== true;
}

export function nestingRejection(thread: LineageHolder, update: NestingUpdate): string | null {
  if (!forkFeatureActive("nestedThreads")) return null;
  if (update.listed !== undefined && !isNestedLineage(thread.lineage)) {
    return "has no parent, so it cannot be hidden from or shown in the sidebar.";
  }
  if (update.detached === undefined) return null;
  if (!isNestedLineage(thread.lineage)) return "has no parent to detach from.";
  const listedAfterUpdate = isListedThreadLineage({
    ...thread.lineage,
    ...(update.listed === undefined ? {} : { listed: update.listed }),
  });
  return listedAfterUpdate ? null : "is hidden from the sidebar, so it cannot be detached.";
}

export function nestingPatch(thread: LineageHolder, update: NestingUpdate): Partial<LineageHolder> {
  if (!forkFeatureActive("nestedThreads")) return {};
  if (update.listed === undefined && update.detached === undefined) return {};
  return {
    lineage: {
      ...thread.lineage,
      ...(update.listed === undefined ? {} : { listed: update.listed }),
      ...(update.detached === undefined ? {} : { detached: true }),
    },
  };
}

export function withListed<Thread extends LineageHolder>(
  thread: Thread,
  listed: boolean | undefined,
): Thread {
  return { ...thread, ...nestingPatch(thread, { listed }) };
}
