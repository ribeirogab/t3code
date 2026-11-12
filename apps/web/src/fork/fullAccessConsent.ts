import type { ThreadStructure } from "@t3tools/client-runtime/state/shell";
import {
  FORK_CONSENT_REFUSAL_TEXT,
  FORK_NEEDS_YES_OUTPUT_KEY,
  type RunId,
  type RuntimeMode,
} from "@t3tools/contracts";
import { create } from "zustand";

type TurnItem = ThreadStructure["turnItems"][number];
type Message = ThreadStructure["messages"][number];

export function turnItemNeedsYes(item: TurnItem): boolean {
  if (item.type === "dynamic_tool") {
    const output = item.output;
    return (
      output !== null &&
      typeof output === "object" &&
      Reflect.get(output, FORK_NEEDS_YES_OUTPUT_KEY) === true
    );
  }
  if (item.type === "command_execution") {
    return item.output?.includes(FORK_CONSENT_REFUSAL_TEXT) ?? false;
  }
  return false;
}

export function runNeedsYes(turnItems: ReadonlyArray<TurnItem>, runId: RunId | null): boolean {
  return runId !== null && turnItems.some((item) => item.runId === runId && turnItemNeedsYes(item));
}

export function lastOwnerMessageText(messages: ReadonlyArray<Message>): string | null {
  const message = messages.findLast(
    (candidate) =>
      candidate.role === "user" && candidate.createdBy === "user" && candidate.text.trim() !== "",
  );
  return message?.text ?? null;
}

export function shouldOfferSupervisedTurn(input: {
  readonly enabled: boolean;
  readonly runtimeMode: RuntimeMode;
  readonly isWorking: boolean;
  readonly switching: boolean;
  readonly latestRunNeedsYes: boolean;
  readonly ownerMessageText: string | null;
}): boolean {
  return (
    input.enabled &&
    input.runtimeMode === "full-access" &&
    !input.isWorking &&
    !input.switching &&
    input.latestRunNeedsYes &&
    input.ownerMessageText !== null
  );
}

interface SupervisedTurnState {
  readonly switchingThreadKeys: Readonly<Record<string, true>>;
  readonly setSwitching: (threadKey: string, switching: boolean) => void;
}

export const useSupervisedTurnStore = create<SupervisedTurnState>()((set) => ({
  switchingThreadKeys: {},
  setSwitching: (threadKey, switching) =>
    set((state) => {
      const { [threadKey]: _current, ...rest } = state.switchingThreadKeys;
      return { switchingThreadKeys: switching ? { ...rest, [threadKey]: true } : rest };
    }),
}));
