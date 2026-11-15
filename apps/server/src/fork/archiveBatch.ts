import type { CommandId, OrchestrationV2AppThread } from "@t3tools/contracts";

export const archiveBatchField = (command: { readonly archiveBatchId?: CommandId | undefined }) =>
  command.archiveBatchId === undefined ? {} : { archiveBatchId: command.archiveBatchId };

export function withoutArchiveBatch(thread: OrchestrationV2AppThread): OrchestrationV2AppThread {
  if (!("archiveBatchId" in thread)) return thread;
  const { archiveBatchId: _archiveBatchId, ...unbatched } = thread;
  return unbatched;
}
