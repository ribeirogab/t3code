import {
  forkFeatureActive,
  parseGoalCommand,
  type OrchestrationV2ConversationMessage,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2Run,
  type OrchestrationV2ThreadProjection,
  type RunId,
  type ThreadId,
} from "@t3tools/contracts";
import { latestExecutedRun } from "@t3tools/shared/orchestrationV2ThreadError";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { ProjectionStoreV2Error } from "../../orchestration-v2/ProjectionStore.ts";
import { queuedRunsInDeliveryOrder } from "../../orchestration-v2/QueuedRunOrder.ts";
import { goalCommandText } from "./handoffRules.ts";

export const GOAL_MET_LINE = "Goal met.";

const QUEUED_GOAL_SUFFIX = ":goal";

export function queuedGoalId(id: string): string {
  return `${id}${QUEUED_GOAL_SUFFIX}`;
}

export function isQueuedGoal(
  message: Pick<OrchestrationV2ConversationMessage, "id" | "createdBy" | "text" | "attachments">,
): boolean {
  return (
    message.createdBy === "agent" &&
    message.id.endsWith(QUEUED_GOAL_SUFFIX) &&
    parseGoalCommand(message)?.type === "set"
  );
}

export function withGoalNote(text: string, goal: string | undefined): string {
  if (goal === undefined) return text;
  const note = [
    `When this turn ends, T3 Code sends you \`${goalCommandText(goal)}\`.`,
    "Ask what you need to know first with your question tool (Claude `AskUserQuestion`, Codex `request_user_input`), not in your reply: the goal waits for the answer.",
    `If this turn meets the goal, write the line \`${GOAL_MET_LINE}\`, and the goal is not sent.`,
  ].join(" ");
  return text.length === 0 ? note : `${text}\n\n${note}`;
}

function bareLine(line: string): string {
  return line
    .replace(/[*_`.]/g, "")
    .trim()
    .toLowerCase();
}

export function declaresGoalMet(reply: string): boolean {
  const goalMet = bareLine(GOAL_MET_LINE);
  return reply.split("\n").some((line) => bareLine(line) === goalMet);
}

export interface GoalStepInput {
  readonly enabled: boolean;
  readonly questionOpen: boolean;
  readonly otherRunQueued: boolean;
  readonly goalMet: boolean;
}

export type GoalStep = "start" | "hold" | "drop";

export function goalStep(input: GoalStepInput): GoalStep {
  if (!input.enabled) return "start";
  if (input.questionOpen || input.otherRunQueued) return "hold";
  return input.goalMet ? "drop" : "start";
}

interface GoalReplyReader {
  readonly getThreadRecords: (
    threadId: ThreadId,
    fields: ReadonlyArray<"messages">,
    filter: {
      readonly messageRunIds: ReadonlyArray<RunId>;
      readonly messageRoles: ReadonlyArray<"assistant">;
    },
  ) => Effect.Effect<
    {
      readonly messages: ReadonlyArray<
        Pick<OrchestrationV2ConversationMessage, "text" | "createdAt">
      >;
    },
    ProjectionStoreV2Error
  >;
}

type GoalProjection = Pick<
  OrchestrationV2ThreadProjection,
  "runs" | "messages" | "runtimeRequests"
>;

type SystemEvent = Omit<OrchestrationV2DomainEvent, "id">;

function questionOpenSince(projection: GoalProjection, run: OrchestrationV2Run): boolean {
  if (run.startedAt === null) return false;
  const startedAt = DateTime.toEpochMillis(run.startedAt);
  return projection.runtimeRequests.some(
    (request) =>
      request.kind === "user_input" &&
      request.status === "pending" &&
      DateTime.toEpochMillis(request.createdAt) >= startedAt,
  );
}

const replyDeclaresGoalMet = Effect.fn("fork.threadHandoff.replyDeclaresGoalMet")(function* (
  reader: GoalReplyReader,
  threadId: ThreadId,
  runId: RunId,
) {
  const { messages } = yield* reader.getThreadRecords(threadId, ["messages"], {
    messageRunIds: [runId],
    messageRoles: ["assistant"],
  });
  const reply = messages.toSorted(
    (left, right) =>
      DateTime.toEpochMillis(right.createdAt) - DateTime.toEpochMillis(left.createdAt),
  )[0];
  return reply !== undefined && declaresGoalMet(reply.text);
});

export const queuedGoalEvents = Effect.fn("fork.threadHandoff.queuedGoalEvents")(function* (
  reader: GoalReplyReader,
  projection: GoalProjection,
  goalRun: OrchestrationV2Run | undefined,
  cancellationEvents: (run: OrchestrationV2Run, now: DateTime.Utc) => ReadonlyArray<SystemEvent>,
) {
  const none: ReadonlyArray<SystemEvent> = [];
  if (goalRun === undefined) return none;
  const message = projection.messages.find((candidate) => candidate.id === goalRun.userMessageId);
  if (message === undefined || !isQueuedGoal(message)) return none;
  const endedRun = latestExecutedRun(projection.runs);
  const input: GoalStepInput = {
    enabled: forkFeatureActive("goalOnNewThreads"),
    questionOpen: endedRun !== null && questionOpenSince(projection, endedRun),
    otherRunQueued: queuedRunsInDeliveryOrder(projection).some(
      (run) => run.id !== goalRun.id && run.queueHeld !== true,
    ),
    goalMet: false,
  };
  const goalMet =
    input.enabled &&
    endedRun !== null &&
    goalStep(input) === "start" &&
    (yield* replyDeclaresGoalMet(reader, goalRun.threadId, endedRun.id));
  const step = goalStep({ ...input, goalMet });
  if (step === "start") return none;
  const now = yield* DateTime.now;
  if (step === "drop") return cancellationEvents(goalRun, now);
  const held: SystemEvent = {
    type: "run.updated",
    threadId: goalRun.threadId,
    runId: goalRun.id,
    providerInstanceId: goalRun.providerInstanceId,
    occurredAt: now,
    payload: { ...goalRun, queueHeld: true },
  };
  return [held];
});
