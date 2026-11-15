import {
  CommandId,
  forkFeatureActive,
  MessageId,
  parseGoalCommand,
  type ForkGoalUpdateStatus,
  type ForkThreadAttention,
  type OrchestrationV2AppThread,
  type OrchestrationV2Command,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";

type MessageCommand = Extract<OrchestrationV2Command, { readonly type: "message.dispatch" }>;
type MetadataCommand = Extract<OrchestrationV2Command, { readonly type: "thread.metadata.update" }>;
type GoalThread = Pick<OrchestrationV2ProviderThread, "driver" | "goal">;

const REASON_MAX_CHARS = 300;
const GOAL_PAUSE_DRIVERS: ReadonlySet<string> = new Set(["claudeAgent", "codex"]);
const WORK_ITEM_TYPES: ReadonlySet<OrchestrationV2TurnItem["type"]> = new Set([
  "command_execution",
  "dynamic_tool",
  "file_change",
  "file_search",
  "web_search",
  "subagent",
  "user_message",
  "approval_request",
  "user_input_request",
]);

export const GOAL_CLEAR_TEXT = "/goal clear";

export function forkAttentionForShell(
  thread: Pick<OrchestrationV2AppThread, "forkAttention">,
): ForkThreadAttention | null {
  return forkFeatureActive("goalStatus") ? (thread.forkAttention ?? null) : null;
}

export function attentionPatch(
  command: Pick<MetadataCommand, "forkAttention">,
): Partial<Pick<OrchestrationV2AppThread, "forkAttention">> {
  return command.forkAttention === undefined ? {} : { forkAttention: command.forkAttention };
}

export function canPauseGoal(thread: GoalThread | undefined): thread is GoalThread & {
  readonly goal: NonNullable<GoalThread["goal"]>;
} {
  return thread !== undefined && thread.goal != null && GOAL_PAUSE_DRIVERS.has(thread.driver);
}

function plainLines(text: string): ReadonlyArray<string> {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*(?:#{1,6}\s+|[-*>]\s+|\d+[.)]\s+)/, "")
        .replace(/[*_`]+/g, "")
        .trim(),
    )
    .filter((line) => line.length > 0);
}

function shortReason(line: string): string {
  return line.length <= REASON_MAX_CHARS
    ? line
    : `${line.slice(0, REASON_MAX_CHARS - 1).trimEnd()}…`;
}

export function openQuestion(text: string): string | null {
  const last = plainLines(text).at(-1);
  return last !== undefined && last.endsWith("?") ? shortReason(last) : null;
}

function waitingReason(text: string | null, judgeReason: string | undefined): string {
  const lines = text === null ? [] : plainLines(text);
  const line = lines.find((candidate) => candidate.length > 24) ?? lines[0] ?? judgeReason;
  return shortReason(line ?? "The goal waits for you.");
}

export function isGoalWork(item: Pick<OrchestrationV2TurnItem, "type">): boolean {
  return WORK_ITEM_TYPES.has(item.type);
}

export interface GoalStallState {
  readonly checks: number;
  readonly worked: boolean;
  readonly lastText: string | null;
}

export type GoalStallStep =
  | { readonly type: "watch"; readonly state: GoalStallState }
  | { readonly type: "pause"; readonly reason: string };

export function goalStallStep(input: {
  readonly previous: GoalStallState | undefined;
  readonly checks: number;
  readonly judgeReason: string | undefined;
}): GoalStallStep {
  const { previous, checks } = input;
  const watching: GoalStallState = { checks, worked: false, lastText: null };
  if (previous === undefined) return { type: "watch", state: { ...watching, worked: true } };
  if (checks <= previous.checks) return { type: "watch", state: previous };
  const question = previous.lastText === null ? null : openQuestion(previous.lastText);
  if (question !== null) return { type: "pause", reason: question };
  if (!previous.worked && previous.checks > 0) {
    return { type: "pause", reason: waitingReason(previous.lastText, input.judgeReason) };
  }
  return { type: "watch", state: watching };
}

export function goalUpdateAttention(input: {
  readonly status: ForkGoalUpdateStatus;
  readonly reason: string;
  readonly result: string | undefined;
  readonly objective: string;
}): ForkThreadAttention {
  return {
    status: input.status,
    reason: shortReason(input.reason.trim()),
    goal: input.objective,
    ...(input.status === "done" && input.result !== undefined ? { result: input.result } : {}),
  };
}

function answersThread(command: MessageCommand): boolean {
  return (
    command.notification === undefined &&
    command.creationSource !== "server" &&
    command.creationSource !== "provider"
  );
}

function asksQuestion(command: MessageCommand): boolean {
  return (
    command.createdBy === "user" &&
    command.attachments.length === 0 &&
    !command.text.trim().startsWith("/") &&
    openQuestion(command.text) !== null
  );
}

export function wantsGoalForMessage(command: MessageCommand): boolean {
  return (
    forkFeatureActive("goalStatus") &&
    forkFeatureActive("goalQuestionPause") &&
    asksQuestion(command)
  );
}

function answeredAttention(
  command: MessageCommand,
  attention: ForkThreadAttention,
): ForkThreadAttention | null | undefined {
  if (parseGoalCommand(command) !== null) return null;
  switch (attention.status) {
    case "needs_user":
    case "blocked":
    case "question":
      return attention.goal === undefined ? null : { status: "paused", goal: attention.goal };
    case "done":
      return null;
    case "paused":
      return undefined;
  }
}

interface GoalMessagePlan {
  readonly mutation: MetadataCommand | null;
  readonly pause: MessageCommand | null;
  readonly message: MessageCommand;
}

function metadataUpdate(
  command: MessageCommand,
  forkAttention: ForkThreadAttention | null,
): MetadataCommand {
  return {
    type: "thread.metadata.update",
    commandId: CommandId.make(`${command.commandId}:fork-attention`),
    threadId: command.threadId,
    forkAttention,
  };
}

export function goalClearCommand(input: {
  readonly commandId: string;
  readonly threadId: MessageCommand["threadId"];
}): MessageCommand {
  return {
    type: "message.dispatch",
    commandId: CommandId.make(`${input.commandId}:goal-clear`),
    threadId: input.threadId,
    messageId: MessageId.make(`${input.commandId}:goal-clear`),
    text: GOAL_CLEAR_TEXT,
    attachments: [],
    dispatchMode: { type: "queue_after_active" },
    deliveryIntent: "steer",
    createdBy: "agent",
    creationSource: "server",
  };
}

function queued(command: MessageCommand): MessageCommand {
  const { deliveryIntent: _deliveryIntent, ...rest } = command;
  return { ...rest, dispatchMode: { type: "queue_after_active" } };
}

export function planGoalMessage(input: {
  readonly command: MessageCommand;
  readonly attention: ForkThreadAttention | null | undefined;
  readonly goalThread: GoalThread | undefined;
}): GoalMessagePlan {
  const { command, attention, goalThread } = input;
  const unchanged: GoalMessagePlan = { mutation: null, pause: null, message: command };
  if (!forkFeatureActive("goalStatus")) return unchanged;
  const question = openQuestion(command.text);
  if (
    wantsGoalForMessage(command) &&
    question !== null &&
    canPauseGoal(goalThread) &&
    goalThread.goal.status === "active"
  ) {
    return {
      mutation: metadataUpdate(command, {
        status: "question",
        reason: question,
        goal: goalThread.goal.objective,
      }),
      pause: goalClearCommand({ commandId: command.commandId, threadId: command.threadId }),
      message: queued(command),
    };
  }
  if (attention == null || !answersThread(command)) return unchanged;
  const next = answeredAttention(command, attention);
  return next === undefined ? unchanged : { ...unchanged, mutation: metadataUpdate(command, next) };
}
