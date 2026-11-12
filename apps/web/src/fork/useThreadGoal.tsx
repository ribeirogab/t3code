import { presentProviderGoal } from "@t3tools/client-runtime/state/thread-execution";
import type { OrchestrationV2ProviderGoal, ThreadId } from "@t3tools/contracts";
import { TargetIcon } from "lucide-react";

import { goalNowItem } from "~/components/chat/ThreadActivityBanners";
import type { ThreadNowItem } from "~/components/chat/ThreadNow";
import { InlineButton } from "~/components/ui/button";

import { useForkFeature } from "./forkFeatures";
import type { GoalCardModel } from "./GoalComposerCard";
import {
  pauseGoal,
  resolveGoalPauseView,
  resumeGoal,
  usePausedGoalsStore,
  type GoalPauseView,
} from "./goalPause";

type SendCommand = (text: string, failureMessage: string) => Promise<boolean>;

interface GoalInput {
  readonly threadKey: string;
  readonly threadId: ThreadId;
  readonly goal: OrchestrationV2ProviderGoal | null;
  readonly view: GoalPauseView;
  readonly isWorking: boolean;
  readonly onSendCommand: SendCommand;
  readonly onForget: () => void;
}

function pausedGoalNowItem(input: GoalInput & { readonly objective: string }): ThreadNowItem {
  const { threadKey, objective, onSendCommand } = input;
  return {
    id: `paused-goal:${threadKey}`,
    icon: <TargetIcon />,
    title: "Goal paused",
    description: objective,
    actions: (
      <>
        {input.isWorking ? null : (
          <>
            <InlineButton
              onClick={() => void resumeGoal({ threadKey, objective, send: onSendCommand })}
            >
              Resume
            </InlineButton>
            <span aria-hidden>·</span>
          </>
        )}
        <InlineButton tone="muted" onClick={input.onForget}>
          Clear
        </InlineButton>
      </>
    ),
  };
}

function goalNowLine(input: GoalInput): ThreadNowItem | null {
  const { threadKey, threadId, goal, view, isWorking, onSendCommand } = input;
  if (view.kind === "paused") return pausedGoalNowItem({ ...input, objective: view.objective });
  if (goal === null) return null;

  const upstream = goalNowItem({
    threadId,
    goal,
    isWorking,
    onSendCommand: async (text, failureMessage) => {
      await onSendCommand(text, failureMessage);
    },
  });
  if (view.kind === "upstream") return upstream;
  return {
    ...upstream,
    actions: (
      <>
        <InlineButton
          onClick={() =>
            void pauseGoal({ threadKey, objective: goal.objective, send: onSendCommand })
          }
        >
          Pause
        </InlineButton>
        <span aria-hidden>·</span>
        {upstream.actions}
      </>
    ),
  };
}

function goalCard(input: GoalInput): GoalCardModel | null {
  const { threadKey, goal, view, isWorking, onSendCommand } = input;
  const id = `goal-card:${threadKey}`;
  if (view.kind === "paused") {
    const { objective } = view;
    return {
      id,
      title: "Goal paused",
      objective,
      usage: null,
      onClear: input.onForget,
      onPause: null,
      onResume: isWorking
        ? null
        : () => void resumeGoal({ threadKey, objective, send: onSendCommand }),
    };
  }
  if (goal === null) return null;

  const presentation = presentProviderGoal(goal, isWorking);
  return {
    id,
    title: presentation.title,
    objective: presentation.objective,
    usage: presentation.usage,
    onClear: () => void onSendCommand("/goal clear", "Failed to clear goal."),
    onPause:
      view.kind === "pausable"
        ? () => void pauseGoal({ threadKey, objective: goal.objective, send: onSendCommand })
        : null,
    onResume:
      presentation.canResume && !isWorking
        ? () => void onSendCommand("/goal resume", "Failed to resume goal.")
        : null,
  };
}

export function useThreadGoal(input: {
  readonly threadKey: string;
  readonly threadId: ThreadId | null;
  readonly goal: OrchestrationV2ProviderGoal | null;
  readonly isWorking: boolean;
  readonly onSendCommand: SendCommand;
}): { readonly now: ThreadNowItem | null; readonly card: GoalCardModel | null } {
  const { threadKey, threadId, goal, isWorking, onSendCommand } = input;
  const pauseEnabled = useForkFeature("goalPause");
  const cardEnabled = useForkFeature("goalComposerCard");
  const pausedObjective = usePausedGoalsStore((state) => state.objectives[threadKey]);
  const forget = usePausedGoalsStore((state) => state.forget);
  if (threadId === null) return { now: null, card: null };
  const goalInput: GoalInput = {
    threadKey,
    threadId,
    goal,
    view: resolveGoalPauseView({ enabled: pauseEnabled, goal, pausedObjective }),
    isWorking,
    onSendCommand,
    onForget: () => forget(threadKey),
  };
  if (cardEnabled) return { now: null, card: goalCard(goalInput) };
  return { now: goalNowLine(goalInput), card: null };
}
