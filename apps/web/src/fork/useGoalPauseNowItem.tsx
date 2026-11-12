import type { OrchestrationV2ProviderGoal, ThreadId } from "@t3tools/contracts";
import { TargetIcon } from "lucide-react";

import { goalNowItem } from "~/components/chat/ThreadActivityBanners";
import type { ThreadNowItem } from "~/components/chat/ThreadNow";
import { InlineButton } from "~/components/ui/button";

import { useForkFeature } from "./forkFeatures";
import { pauseGoal, resolveGoalPauseView, resumeGoal, usePausedGoalsStore } from "./goalPause";

type SendCommand = (text: string, failureMessage: string) => Promise<boolean>;

function pausedGoalNowItem(input: {
  readonly threadKey: string;
  readonly objective: string;
  readonly isWorking: boolean;
  readonly onSendCommand: SendCommand;
  readonly onForget: () => void;
}): ThreadNowItem {
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

export function useGoalPauseNowItem(input: {
  readonly threadKey: string;
  readonly threadId: ThreadId | null;
  readonly goal: OrchestrationV2ProviderGoal | null;
  readonly isWorking: boolean;
  readonly onSendCommand: SendCommand;
}): ThreadNowItem | null {
  const { threadKey, threadId, goal, isWorking, onSendCommand } = input;
  const enabled = useForkFeature("goalPause");
  const pausedObjective = usePausedGoalsStore((state) => state.objectives[threadKey]);
  const forget = usePausedGoalsStore((state) => state.forget);
  if (threadId === null) return null;
  const view = resolveGoalPauseView({ enabled, goal, pausedObjective });

  if (view.kind === "paused") {
    return pausedGoalNowItem({
      threadKey,
      objective: view.objective,
      isWorking,
      onSendCommand,
      onForget: () => forget(threadKey),
    });
  }
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
