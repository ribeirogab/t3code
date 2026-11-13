import type { OrchestrationV2AppThreadLineage } from "@t3tools/contracts";

type ParentLineage = Pick<
  OrchestrationV2AppThreadLineage,
  "parentThreadId" | "relationshipToParent" | "sideChat"
>;

export function isSubagentLineage(lineage: ParentLineage, nestedThreads: boolean): boolean {
  if (lineage.relationshipToParent === "subagent") return true;
  return (
    nestedThreads &&
    lineage.relationshipToParent === null &&
    lineage.parentThreadId !== null &&
    lineage.sideChat !== true
  );
}

export function parentLinkTitle(
  parent: { readonly title: string; readonly archivedAt: string | null } | null,
  nestedThreads: boolean,
): string | null {
  if (!nestedThreads) return parent?.title ?? "Parent thread";
  return parent !== null && parent.archivedAt === null ? parent.title : null;
}
