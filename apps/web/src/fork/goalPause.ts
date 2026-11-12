import type { OrchestrationV2ProviderGoal } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

type SendGoalCommand = (text: string, failureMessage: string) => Promise<boolean>;

interface PausedGoalsState {
  objectives: Record<string, string>;
  remember: (threadKey: string, objective: string) => void;
  forget: (threadKey: string) => void;
}

export function mergePersistedPausedGoals(persisted: unknown): Record<string, string> {
  const objectives =
    persisted !== null && typeof persisted === "object" && "objectives" in persisted
      ? persisted.objectives
      : null;
  if (objectives === null || typeof objectives !== "object") return {};
  return Object.fromEntries(
    Object.entries(objectives).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1].trim().length > 0,
    ),
  );
}

export const usePausedGoalsStore = create<PausedGoalsState>()(
  persist(
    (set) => ({
      objectives: {},
      remember: (threadKey, objective) =>
        set((state) => ({ objectives: { ...state.objectives, [threadKey]: objective } })),
      forget: (threadKey) =>
        set((state) => {
          if (!(threadKey in state.objectives)) return state;
          const { [threadKey]: _forgotten, ...objectives } = state.objectives;
          return { objectives };
        }),
    }),
    {
      name: "t3code:fork:paused-goals:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ objectives }) => ({ objectives }),
      merge: (persisted, current) => ({
        ...current,
        objectives: mergePersistedPausedGoals(persisted),
      }),
    },
  ),
);

export type GoalPauseView =
  | { readonly kind: "upstream" }
  | { readonly kind: "pausable" }
  | { readonly kind: "paused"; readonly objective: string };

export function resolveGoalPauseView(input: {
  readonly enabled: boolean;
  readonly goal: OrchestrationV2ProviderGoal | null;
  readonly pausedObjective: string | undefined;
}): GoalPauseView {
  if (!input.enabled) return { kind: "upstream" };
  if (input.goal?.status === "active") return { kind: "pausable" };
  if (input.goal === null && input.pausedObjective !== undefined) {
    return { kind: "paused", objective: input.pausedObjective };
  }
  return { kind: "upstream" };
}

export async function pauseGoal(input: {
  readonly threadKey: string;
  readonly objective: string;
  readonly send: SendGoalCommand;
}): Promise<void> {
  const { remember, forget } = usePausedGoalsStore.getState();
  remember(input.threadKey, input.objective);
  const cleared = await input.send("/goal clear", "Failed to pause goal.");
  if (!cleared) forget(input.threadKey);
}

export async function resumeGoal(input: {
  readonly threadKey: string;
  readonly objective: string;
  readonly send: SendGoalCommand;
}): Promise<void> {
  const resumed = await input.send(`/goal ${input.objective}`, "Failed to resume goal.");
  if (resumed) usePausedGoalsStore.getState().forget(input.threadKey);
}
