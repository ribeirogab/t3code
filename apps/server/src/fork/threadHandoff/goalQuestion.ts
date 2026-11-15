import {
  forkFeatureActive,
  parseGoalCommand,
  type MessageId,
  type OrchestrationV2Run,
  type OrchestrationV2Subagent,
  type RunId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type {
  ProjectionStoreV2Error,
  ProjectionStoreV2Shape,
} from "../../orchestration-v2/ProjectionStore.ts";
import type { TurnStarter } from "../notifyParent.ts";

export function startsAgentGoal(starter: Pick<TurnStarter, "createdBy" | "text">): boolean {
  return (
    forkFeatureActive("goalOnNewThreads") &&
    starter.createdBy === "agent" &&
    parseGoalCommand(starter)?.type === "set"
  );
}

interface RunMessageReader {
  readonly getRunMessage: (
    threadId: ThreadId,
    runId: RunId,
  ) => Effect.Effect<TurnStarter | undefined, ProjectionStoreV2Error>;
}

type ChildQuestionReader = Pick<ProjectionStoreV2Shape, "getThreadRecords" | "getRunMessage">;

const askedInGoalRun = Effect.fn("fork.threadHandoff.askedInGoalRun")(function* (
  reader: ChildQuestionReader,
  input: {
    readonly childThreadId: ThreadId;
    readonly parentThreadId: ThreadId;
    readonly wakeMessageId: MessageId;
  },
) {
  if (!forkFeatureActive("goalOnNewThreads")) return false;
  const { runtimeRequests } = yield* reader.getThreadRecords(input.childThreadId, [
    "runtimeRequests",
  ]);
  const request = runtimeRequests.find(
    (candidate) =>
      candidate.kind === "user_input" &&
      candidate.status === "pending" &&
      input.wakeMessageId ===
        `message:delegated-task-question:${input.parentThreadId}:${candidate.id}`,
  );
  if (request === undefined) return false;
  const { nodes } = yield* reader.getThreadRecords(input.childThreadId, ["nodes"], {
    nodeIds: [request.nodeId],
  });
  const runId = nodes[0]?.runId ?? null;
  const starter =
    runId === null ? undefined : yield* reader.getRunMessage(input.childThreadId, runId);
  return starter !== undefined && startsAgentGoal(starter);
});

const SETTLED_TASK_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

export const settledTaskQuestionIsStale = Effect.fn(
  "fork.threadHandoff.settledTaskQuestionIsStale",
)(function* (
  reader: ChildQuestionReader,
  task: Pick<OrchestrationV2Subagent, "status">,
  input: {
    readonly childThreadId: ThreadId;
    readonly parentThreadId: ThreadId;
    readonly wakeMessageId: MessageId;
  },
) {
  return SETTLED_TASK_STATUSES.has(task.status) && !(yield* askedInGoalRun(reader, input));
});

export const goalRunTask = Effect.fn("fork.threadHandoff.goalRunTask")(function* <
  Task extends Pick<OrchestrationV2Subagent, "origin" | "childThreadId">,
>(
  reader: RunMessageReader,
  subagents: ReadonlyArray<Task>,
  childThreadId: ThreadId,
  run: Pick<OrchestrationV2Run, "id"> | undefined,
) {
  if (run === undefined || !forkFeatureActive("goalOnNewThreads")) return undefined;
  const starter = yield* reader.getRunMessage(childThreadId, run.id);
  if (starter === undefined || !startsAgentGoal(starter)) return undefined;
  return subagents.findLast(
    (task) => task.origin === "app_owned" && task.childThreadId === childThreadId,
  );
});
