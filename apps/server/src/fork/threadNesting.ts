import type { OrchestrationV2AppThread, OrchestrationV2AppThreadLineage } from "@t3tools/contracts";

export function isUnlistedSubagentLineage(
  lineage: Pick<OrchestrationV2AppThreadLineage, "relationshipToParent" | "listed">,
): boolean {
  return lineage.relationshipToParent === "subagent" && lineage.listed !== true;
}

export function canSetListed(thread: Pick<OrchestrationV2AppThread, "lineage">): boolean {
  return thread.lineage.parentThreadId !== null && thread.lineage.sideChat !== true;
}

export function listedPatch(
  thread: Pick<OrchestrationV2AppThread, "lineage">,
  listed: boolean | undefined,
): Partial<Pick<OrchestrationV2AppThread, "lineage">> {
  return listed === undefined ? {} : { lineage: { ...thread.lineage, listed } };
}

export function withListed<Thread extends Pick<OrchestrationV2AppThread, "lineage">>(
  thread: Thread,
  listed: boolean | undefined,
): Thread {
  return { ...thread, ...listedPatch(thread, listed) };
}
