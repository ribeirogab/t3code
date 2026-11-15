import {
  forkFeatureActive,
  type OrchestrationV2PendingBackgroundTask,
  type OrchestrationV2ThreadShell,
  type ThreadId,
} from "@t3tools/contracts";

export interface WorkflowRunWait {
  readonly threadId: ThreadId;
  readonly watchId: string;
  readonly label: string;
}

type WaitingShell = Pick<
  OrchestrationV2ThreadShell,
  "id" | "activeRunId" | "activityRunStatus" | "status" | "pendingBackgroundTasks"
>;

const RUNNING_STATUSES = new Set<OrchestrationV2ThreadShell["status"]>([
  "preparing",
  "queued",
  "starting",
  "running",
  "waiting",
]);

let waitsByThread: ReadonlyMap<
  ThreadId,
  ReadonlyArray<OrchestrationV2PendingBackgroundTask>
> = new Map();

export function publishWorkflowRunWaits(waits: ReadonlyArray<WorkflowRunWait>): void {
  const next = new Map<ThreadId, Array<OrchestrationV2PendingBackgroundTask>>();
  for (const wait of waits) {
    const tasks = next.get(wait.threadId) ?? [];
    tasks.push({
      taskId: `fork-workflow-run:${wait.watchId}`,
      description: wait.label,
      kind: "background_task",
      awaited: true,
    });
    next.set(wait.threadId, tasks);
  }
  waitsByThread = next;
}

function isWaitingShell(thread: object): thread is WaitingShell {
  return "pendingBackgroundTasks" in thread && "activeRunId" in thread && "status" in thread;
}

function settled(thread: WaitingShell): boolean {
  return (
    thread.activeRunId === null &&
    thread.activityRunStatus == null &&
    !RUNNING_STATUSES.has(thread.status) &&
    thread.status !== "failed"
  );
}

export function withWorkflowRunWaits<Thread extends object>(thread: Thread): Thread {
  if (!isWaitingShell(thread)) return thread;
  const waits = waitsByThread.get(thread.id);
  if (
    waits === undefined ||
    !settled(thread) ||
    !forkFeatureActive("waitingDetail") ||
    !forkFeatureActive("workflowRunWatch")
  ) {
    return thread;
  }
  return {
    ...thread,
    pendingBackgroundTasks: [...(thread.pendingBackgroundTasks ?? []), ...waits],
  };
}
