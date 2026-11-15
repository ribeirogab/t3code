import {
  CommandId,
  IDLE_COMPACTION_TEXT,
  MessageId,
  supportsCompactAndContinue,
  type OrchestrationV2Command,
  type ProviderDriverKind,
  type ThreadId,
} from "@t3tools/contracts";

import { goalCommandText, goalProblem } from "../threadHandoff/handoffRules.ts";

type MessageCommand = Extract<OrchestrationV2Command, { readonly type: "message.dispatch" }>;

export interface CompactAndContinueInput {
  readonly message: string | undefined;
  readonly goal: string | undefined;
}

export function compactAndContinueProblem(
  input: CompactAndContinueInput,
  driver: ProviderDriverKind | undefined,
): string | null {
  if (!supportsCompactAndContinue(driver)) {
    return "Compact and continue needs a Claude or Codex thread. Ask the user to run /compact.";
  }
  if (input.message === undefined && input.goal === undefined) {
    return "Pass `message`, `goal`, or both: they say how the thread continues after /compact.";
  }
  return input.goal === undefined ? null : goalProblem(input.goal, driver);
}

export function compactAndContinueTexts(input: CompactAndContinueInput): ReadonlyArray<string> {
  return [
    IDLE_COMPACTION_TEXT,
    ...(input.message === undefined ? [] : [input.message]),
    ...(input.goal === undefined ? [] : [goalCommandText(input.goal)]),
  ];
}

export function compactAndContinueCommands(input: {
  readonly commandId: string;
  readonly threadId: ThreadId;
  readonly texts: ReadonlyArray<string>;
}): ReadonlyArray<MessageCommand> {
  return input.texts.map((text, index) => {
    const id = `${input.commandId}:compact-and-continue:${index}`;
    return {
      type: "message.dispatch",
      commandId: CommandId.make(id),
      threadId: input.threadId,
      messageId: MessageId.make(id),
      text,
      attachments: [],
      dispatchMode: { type: "queue_after_active" },
      createdBy: "agent",
      creationSource: "mcp",
    };
  });
}
