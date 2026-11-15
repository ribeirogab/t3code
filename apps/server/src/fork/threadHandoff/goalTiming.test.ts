import { describe, expect, it } from "vite-plus/test";
import { MessageId } from "@t3tools/contracts";

import {
  declaresGoalMet,
  GOAL_MET_LINE,
  goalStep,
  isQueuedGoal,
  queuedGoalId,
  type GoalStep,
  type GoalStepInput,
} from "./goalTiming.ts";

describe("goalStep", () => {
  const plain: GoalStepInput = {
    enabled: true,
    questionOpen: false,
    otherRunQueued: false,
    goalMet: false,
  };
  const cases: ReadonlyArray<readonly [string, GoalStepInput, GoalStep]> = [
    ["plain first turn: the goal starts as today", plain, "start"],
    ["open question: the goal waits for the answer", { ...plain, questionOpen: true }, "hold"],
    ["the answer is queued: it runs before the goal", { ...plain, otherRunQueued: true }, "hold"],
    ["work done: no goal", { ...plain, goalMet: true }, "drop"],
    [
      "open question and work done: the answer still comes first",
      { ...plain, questionOpen: true, goalMet: true },
      "hold",
    ],
    ["toggle off: the goal starts as today", { ...plain, enabled: false }, "start"],
    [
      "toggle off with an open question and work done: the goal starts as today",
      { enabled: false, questionOpen: true, otherRunQueued: true, goalMet: true },
      "start",
    ],
  ];

  it.each(cases)("%s", (_name, input, step) => {
    expect(goalStep(input)).toBe(step);
  });
});

describe("declaresGoalMet", () => {
  it.each([
    [`Done.\n\n${GOAL_MET_LINE}`, true],
    [`${GOAL_MET_LINE}\nPR https://github.com/acme/app/pull/1, head abc, checks green`, true],
    ["**Goal met.**", true],
    ["`Goal met`", true],
    ["  goal met.  ", true],
    ["The goal met two of three criteria.", false],
    ["O objetivo já está cumprido.", false],
    ["", false],
  ])("%j declares the goal met: %s", (reply, met) => {
    expect(declaresGoalMet(reply)).toBe(met);
  });
});

describe("isQueuedGoal", () => {
  const goal = {
    id: MessageId.make(queuedGoalId("command:delegate")),
    createdBy: "agent" as const,
    text: "/goal Ship the fix",
    attachments: [],
  };

  it.each([
    ["the goal a fork tool queued", goal, true],
    ["a /goal the owner typed", { ...goal, createdBy: "user" as const }, false],
    ["an agent's /goal from another send", { ...goal, id: MessageId.make("message:send") }, false],
    ["a goal control word", { ...goal, text: "/goal clear" }, false],
  ])("%s: %s", (_name, message, queued) => {
    expect(isQueuedGoal(message)).toBe(queued);
  });
});
