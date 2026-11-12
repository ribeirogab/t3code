import { describe, expect, it, vi } from "vite-plus/test";

import {
  mergePersistedPausedGoals,
  pauseGoal,
  resolveGoalPauseView,
  resumeGoal,
  usePausedGoalsStore,
} from "./goalPause";

const threadKey = "environment-test:thread-test";
const objective = "Ship the release";

function setup() {
  usePausedGoalsStore.setState({ objectives: {} });
}

function pausedObjective() {
  return usePausedGoalsStore.getState().objectives[threadKey];
}

describe("goal pause", () => {
  it("offers Pause for an active goal and Resume for a saved one with no goal", () => {
    const active = { objective, status: "active" as const };
    expect(
      resolveGoalPauseView({ enabled: true, goal: active, pausedObjective: undefined }),
    ).toEqual({ kind: "pausable" });
    expect(resolveGoalPauseView({ enabled: true, goal: null, pausedObjective: objective })).toEqual(
      {
        kind: "paused",
        objective,
      },
    );
    expect(
      resolveGoalPauseView({ enabled: true, goal: active, pausedObjective: objective }),
    ).toEqual({ kind: "pausable" });
    expect(
      resolveGoalPauseView({
        enabled: true,
        goal: { objective, status: "paused" },
        pausedObjective: objective,
      }),
    ).toEqual({ kind: "upstream" });
    expect(
      resolveGoalPauseView({ enabled: false, goal: active, pausedObjective: objective }),
    ).toEqual({ kind: "upstream" });
  });

  it("clears the provider goal and keeps its text", async () => {
    setup();
    const send = vi.fn(async () => true);
    await pauseGoal({ threadKey, objective, send });
    expect(send).toHaveBeenCalledWith("/goal clear", "Failed to pause goal.");
    expect(pausedObjective()).toBe(objective);
  });

  it("drops the saved text when the clear is not sent", async () => {
    setup();
    await pauseGoal({ threadKey, objective, send: async () => false });
    expect(pausedObjective()).toBeUndefined();
  });

  it("sets the goal again with the saved text and forgets it only when sent", async () => {
    setup();
    usePausedGoalsStore.getState().remember(threadKey, objective);
    await resumeGoal({ threadKey, objective, send: async () => false });
    expect(pausedObjective()).toBe(objective);
    const send = vi.fn(async () => true);
    await resumeGoal({ threadKey, objective, send });
    expect(send).toHaveBeenCalledWith(`/goal ${objective}`, "Failed to resume goal.");
    expect(pausedObjective()).toBeUndefined();
  });

  it("keeps only non-empty stored texts", () => {
    expect(mergePersistedPausedGoals(undefined)).toEqual({});
    expect(
      mergePersistedPausedGoals({ objectives: { [threadKey]: objective, empty: " ", wrong: 3 } }),
    ).toEqual({ [threadKey]: objective });
  });
});
