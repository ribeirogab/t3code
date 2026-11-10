import type { OrchestrationV2AppThreadLineage } from "@t3tools/contracts";

type ParentLineage = Pick<
  OrchestrationV2AppThreadLineage,
  "parentThreadId" | "relationshipToParent" | "sideChat"
>;

export function isSubagentLineage(lineage: ParentLineage): boolean {
  if (lineage.relationshipToParent === "subagent") return true;
  return (
    lineage.relationshipToParent === null &&
    lineage.parentThreadId !== null &&
    lineage.sideChat !== true
  );
}

export function activeParent<Parent extends { readonly archivedAt: string | null }>(
  parent: Parent | null,
): Parent | null {
  return parent !== null && parent.archivedAt === null ? parent : null;
}
