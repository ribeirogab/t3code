import { forkFeatureActive, type ServerSettings, type ThreadId } from "@t3tools/contracts";

export function isParkedThread(
  settings: Pick<ServerSettings, "parkedThreadIds">,
  threadId: ThreadId,
): boolean {
  return forkFeatureActive("parkedThreads") && settings.parkedThreadIds.includes(threadId);
}
