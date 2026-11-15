import { parseThreadKey } from "@t3tools/client-runtime/state/entities";
import { presentProviderGoal } from "@t3tools/client-runtime/state/thread-execution";
import type {
  ForkThreadAttention,
  OrchestrationV2ProviderGoal,
  ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import { TargetIcon } from "lucide-react";

import { useOpenLink } from "~/browser/useOpenLink";
import { goalNowItem } from "~/components/chat/ThreadActivityBanners";
import type { ThreadNowItem } from "~/components/chat/ThreadNow";
import { InlineButton } from "~/components/ui/button";
import { threadEnvironment } from "~/state/threads";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";

import { useForkFeature } from "./forkFeatures";
import type { GoalCardModel } from "./GoalComposerCard";
import { resolveGoalStatusCard, type GoalStatusCard } from "./goalStatus.logic";
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

interface StatusActions {
  readonly id: string;
  readonly isWorking: boolean;
  readonly onResume: (objective: string) => void;
  readonly onClear: () => void;
  readonly onOpenResult: NonNullable<GoalCardModel["onOpenResult"]>;
}

function statusCard(status: GoalStatusCard, actions: StatusActions): GoalCardModel {
  if (status.kind === "done") {
    return {
      id: actions.id,
      title: "Goal",
      objective: status.summary ?? "",
      summary: status.summary,
      usage: null,
      icon: "done",
      chip: status.chip,
      result: status.result,
      onOpenResult: actions.onOpenResult,
      onClear: null,
      onPause: null,
      onResume: null,
      onDismiss: actions.onClear,
    };
  }
  const { objective } = status;
  return {
    id: actions.id,
    title: "Goal",
    objective,
    summary: status.summary,
    usage: null,
    icon: status.icon,
    chip: status.chip,
    onClear: actions.onClear,
    onPause: null,
    onResume: actions.isWorking ? null : () => actions.onResume(objective),
  };
}

function statusNowItem(status: GoalStatusCard, actions: StatusActions): ThreadNowItem {
  const resume =
    status.kind === "held" && !actions.isWorking ? (
      <>
        <InlineButton onClick={() => actions.onResume(status.objective)}>Resume</InlineButton>
        <span aria-hidden>·</span>
      </>
    ) : null;
  return {
    id: actions.id,
    icon: <TargetIcon />,
    title: `Goal · ${status.chip.label}`,
    description: status.kind === "held" ? status.summary : (status.result?.label ?? status.summary),
    actions: (
      <>
        {resume}
        <InlineButton tone="muted" onClick={actions.onClear}>
          {status.kind === "done" ? "Dismiss" : "Clear"}
        </InlineButton>
      </>
    ),
  };
}

function scopedThreadRef(threadKey: string, threadId: ThreadId | null): ScopedThreadRef | null {
  if (threadId === null) return null;
  try {
    return parseThreadKey(threadKey);
  } catch {
    return null;
  }
}

export function useThreadGoal(input: {
  readonly threadKey: string;
  readonly threadId: ThreadId | null;
  readonly goal: OrchestrationV2ProviderGoal | null;
  readonly attention?: ForkThreadAttention | null | undefined;
  readonly isWorking: boolean;
  readonly onSendCommand: SendCommand;
}): { readonly now: ThreadNowItem | null; readonly card: GoalCardModel | null } {
  const { threadKey, threadId, goal, isWorking, onSendCommand } = input;
  const pauseEnabled = useForkFeature("goalPause");
  const cardEnabled = useForkFeature("goalComposerCard");
  const statusEnabled = useForkFeature("goalStatus");
  const pausedObjective = usePausedGoalsStore((state) => state.objectives[threadKey]);
  const forget = usePausedGoalsStore((state) => state.forget);
  const threadRef = scopedThreadRef(threadKey, threadId);
  const openLink = useOpenLink(threadRef);
  const updateThreadMetadata = useOrchestrationCommand(
    threadEnvironment.updateMetadata,
    "Failed to clear the goal status.",
  );
  if (threadId === null) return { now: null, card: null };
  const status = resolveGoalStatusCard({
    enabled: statusEnabled,
    attention: input.attention,
    goal,
  });
  if (status === "hidden") return { now: null, card: null };
  if (status !== null) {
    const actions: StatusActions = {
      id: `goal-card:${threadKey}`,
      isWorking,
      onResume: (objective) => void onSendCommand(`/goal ${objective}`, "Failed to resume goal."),
      onClear: () => {
        if (threadRef === null) return;
        void updateThreadMetadata({
          environmentId: threadRef.environmentId,
          input: { threadId: threadRef.threadId, forkAttention: null },
        });
      },
      onOpenResult: (href, event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        void openLink(href, { event });
      },
    };
    return cardEnabled
      ? { now: null, card: statusCard(status, actions) }
      : { now: statusNowItem(status, actions), card: null };
  }
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
