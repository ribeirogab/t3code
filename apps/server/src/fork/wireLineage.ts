import type {
  OrchestrationV2AppThreadLineage,
  OrchestrationV2ThreadStreamItem,
} from "@t3tools/contracts";

interface LineageHolder {
  readonly lineage: OrchestrationV2AppThreadLineage;
}

export function wireLineage(
  lineage: OrchestrationV2AppThreadLineage,
): OrchestrationV2AppThreadLineage {
  if (lineage.detached === true) {
    return lineage.parentThreadId === null && lineage.relationshipToParent === null
      ? lineage
      : { ...lineage, parentThreadId: null, relationshipToParent: null };
  }
  return lineage.relationshipToParent === "subagent" && lineage.listed === true
    ? { ...lineage, relationshipToParent: null }
    : lineage;
}

export function wireThread<Thread extends LineageHolder>(thread: Thread): Thread {
  const lineage = wireLineage(thread.lineage);
  return lineage === thread.lineage ? thread : { ...thread, lineage };
}

export function wireThreads<Thread extends LineageHolder>(
  threads: ReadonlyArray<Thread>,
): ReadonlyArray<Thread> {
  let changed = false;
  const wired = threads.map((thread) => {
    const next = wireThread(thread);
    changed ||= next !== thread;
    return next;
  });
  return changed ? wired : threads;
}

export function wireThreadLists<
  Lists extends {
    readonly threads: ReadonlyArray<LineageHolder>;
    readonly archivedThreads: ReadonlyArray<LineageHolder>;
  },
>(lists: Lists): Lists {
  const threads = wireThreads(lists.threads);
  const archivedThreads = wireThreads(lists.archivedThreads);
  return threads === lists.threads && archivedThreads === lists.archivedThreads
    ? lists
    : { ...lists, threads, archivedThreads };
}

export function wireThreadStreamItem(
  item: OrchestrationV2ThreadStreamItem,
): OrchestrationV2ThreadStreamItem {
  if (item.kind !== "event" || !("payload" in item.event)) return item;
  const { event } = item;
  if (typeof event.payload !== "object" || event.payload === null) return item;
  if (!("lineage" in event.payload)) return item;
  const payload = wireThread(event.payload);
  return payload === event.payload
    ? item
    : ({ ...item, event: { ...event, payload } } as OrchestrationV2ThreadStreamItem);
}
