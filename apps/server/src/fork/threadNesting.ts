import {
  isListedThreadLineage,
  type OrchestrationV2AppThread,
  type OrchestrationV2AppThreadLineage,
} from "@t3tools/contracts";

type LineageHolder = Pick<OrchestrationV2AppThread, "lineage">;

interface NestingUpdate {
  readonly listed?: boolean | undefined;
  readonly detached?: true | undefined;
}

export function isUnlistedSubagentLineage(
  lineage: Pick<OrchestrationV2AppThreadLineage, "relationshipToParent" | "listed">,
): boolean {
  return lineage.relationshipToParent === "subagent" && lineage.listed !== true;
}

function isNestedLineage(lineage: OrchestrationV2AppThreadLineage): boolean {
  return lineage.parentThreadId !== null && lineage.sideChat !== true && lineage.detached !== true;
}

export function nestingRejection(thread: LineageHolder, update: NestingUpdate): string | null {
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
