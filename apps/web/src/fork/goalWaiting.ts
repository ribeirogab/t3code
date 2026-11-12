import type {
  EnvironmentId,
  OrchestrationV2PendingBackgroundTask,
  OrchestrationV2ShellSnapshot,
  OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { isForkFeatureEnabled, useForkFeaturesStore } from "./forkFeatures";

type GoalWaitingThread = Pick<
  OrchestrationV2ThreadShell,
  "goal" | "activeRunId" | "activityRunStatus" | "status" | "pendingBackgroundTasks"
>;

const RUNNING_STATUSES = new Set<OrchestrationV2ThreadShell["status"]>([
  "preparing",
  "queued",
  "starting",
  "running",
  "waiting",
]);

const GOAL_WAITING_TASK = {
  taskId: "fork-active-goal",
  description: "Pursuing goal",
  kind: "background_task",
  awaited: true,
} as const satisfies OrchestrationV2PendingBackgroundTask;

function goalHoldsThread(thread: GoalWaitingThread): boolean {
  return (
    thread.goal?.status === "active" &&
    thread.activeRunId === null &&
    thread.activityRunStatus == null &&
    !RUNNING_STATUSES.has(thread.status) &&
    thread.status !== "failed"
  );
}

const heldThreads = new WeakMap<object, object>();

export function holdThreadForGoal<Thread extends GoalWaitingThread>(thread: Thread): Thread {
  if (!goalHoldsThread(thread)) return thread;
  const cached = heldThreads.get(thread) as Thread | undefined;
  if (cached !== undefined) return cached;
  const held: Thread = {
    ...thread,
    pendingBackgroundTasks: [...(thread.pendingBackgroundTasks ?? []), GOAL_WAITING_TASK],
  };
  heldThreads.set(thread, held);
  return held;
}

const heldSnapshots = new WeakMap<object, object>();

export function holdSnapshotForGoals<
  Snapshot extends { readonly threads: ReadonlyArray<GoalWaitingThread> },
>(snapshot: Snapshot | null): Snapshot | null {
  if (snapshot === null) return null;
  const cached = heldSnapshots.get(snapshot) as Snapshot | undefined;
  if (cached !== undefined) return cached;
  const threads = snapshot.threads.map(holdThreadForGoal);
  const held = threads.every((thread, index) => thread === snapshot.threads[index])
    ? snapshot
    : { ...snapshot, threads };
  heldSnapshots.set(snapshot, held);
  return held;
}

const goalWaitingEnabledAtom = Atom.make((get) => {
  let enabled = isForkFeatureEnabled("goalWaiting");
  get.addFinalizer(
    useForkFeaturesStore.subscribe(() => {
      const next = isForkFeatureEnabled("goalWaiting");
      if (next === enabled) return;
      enabled = next;
      get.setSelf(next);
    }),
  );
  return enabled;
}).pipe(Atom.withLabel("fork-goal-waiting-enabled"));

export function withGoalWaiting(
  snapshotAtom: (environmentId: EnvironmentId) => Atom.Atom<OrchestrationV2ShellSnapshot | null>,
) {
  return Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get) => {
      const snapshot = get(snapshotAtom(environmentId));
      return get(goalWaitingEnabledAtom) ? holdSnapshotForGoals(snapshot) : snapshot;
    }).pipe(Atom.withLabel(`fork-goal-waiting:${environmentId}`)),
  );
}
