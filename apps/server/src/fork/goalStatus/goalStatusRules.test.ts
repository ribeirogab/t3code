import { describe, expect, it } from "vite-plus/test";
import {
  CommandId,
  MessageId,
  overrideForkFeatureSettings,
  ProviderDriverKind,
  ThreadId,
  type ForkThreadAttention,
  type OrchestrationV2Command,
} from "@t3tools/contracts";

import {
  GOAL_CLEAR_TEXT,
  goalStallStep,
  openQuestion,
  planGoalMessage,
  type GoalStallState,
  type GoalStallStep,
} from "./goalStatusRules.ts";

describe("openQuestion", () => {
  it.each([
    ["Should I deploy to production?", "Should I deploy to production?"],
    ["Deployed.\n\n**Do I merge the PR now?**", "Do I merge the PR now?"],
    ["## PRECISO DE VOCÊ\nRode `/goal clear`. Sigo parado até você responder.", null],
    ["Is it green? Yes, it is.", null],
    ["", null],
  ])("%j asks %j", (text, question) => {
    expect(openQuestion(text)).toBe(question);
  });
});

describe("goalStallStep", () => {
  const watching = (state: Partial<GoalStallState>): GoalStallState => ({
    checks: 1,
    worked: false,
    lastText: null,
    ...state,
  });
  const cases: ReadonlyArray<
    readonly [string, GoalStallState | undefined, number, GoalStallStep["type"]]
  > = [
    ["first sight of a goal: watch", undefined, 3, "watch"],
    ["no new block: watch", watching({ checks: 2 }), 2, "watch"],
    ["blocked after work: watch", watching({ worked: true, lastText: "Tests pass." }), 2, "watch"],
    [
      "blocked again with no work between: pause",
      watching({ lastText: "## PRECISO DE VOCÊ\nRode `/goal clear` para encerrar a meta." }),
      2,
      "pause",
    ],
    [
      "the turn tried to end on a question: pause",
      watching({ checks: 0, worked: true, lastText: "PR is green. Should I merge it?" }),
      1,
      "pause",
    ],
    ["the first block, before any check: watch", watching({ checks: 0 }), 1, "watch"],
  ];

  it.each(cases)("%s", (_name, previous, checks, type) => {
    expect(goalStallStep({ previous, checks, judgeReason: undefined }).type).toBe(type);
  });

  it("names what the agent waits for", () => {
    const step = goalStallStep({
      previous: watching({
        lastText:
          "## PRECISO DE VOCÊ\nRode `/goal clear`: a ACME-3358 está em produção e o hook pede outra prova.",
      }),
      checks: 2,
      judgeReason: "Condition not met.",
    });
    expect(step).toEqual({
      type: "pause",
      reason: "Rode /goal clear: a ACME-3358 está em produção e o hook pede outra prova.",
    });
  });
});

describe("planGoalMessage", () => {
  const threadId = ThreadId.make("thread:goal");
  const message = (
    text: string,
    fields: Partial<Extract<OrchestrationV2Command, { readonly type: "message.dispatch" }>> = {},
  ): Extract<OrchestrationV2Command, { readonly type: "message.dispatch" }> => ({
    type: "message.dispatch",
    commandId: CommandId.make("command:steer"),
    threadId,
    messageId: MessageId.make("message:steer"),
    text,
    attachments: [],
    dispatchMode: { type: "queue_after_active" },
    deliveryIntent: "steer",
    createdBy: "user",
    creationSource: "web",
    ...fields,
  });
  const goalThread = {
    driver: ProviderDriverKind.make("claudeAgent"),
    goal: { objective: "Ship the release", status: "active" as const },
  };
  const needsYou: ForkThreadAttention = {
    status: "needs_user",
    reason: "Send the Mac password",
    goal: "Ship the release",
  };

  it("pauses an active goal for the owner's question and queues the question after it", () => {
    const plan = planGoalMessage({
      command: message("esses checks rodam no CI?"),
      attention: null,
      goalThread,
    });
    expect(plan.mutation?.forkAttention).toEqual({
      status: "question",
      reason: "esses checks rodam no CI?",
      goal: "Ship the release",
    });
    expect(plan.pause).toMatchObject({ text: GOAL_CLEAR_TEXT, deliveryIntent: "steer" });
    expect(plan.message.dispatchMode).toEqual({ type: "queue_after_active" });
    expect(plan.message.deliveryIntent).toBeUndefined();
  });

  it.each([
    ["a statement", message("pode seguir"), goalThread],
    ["a question from another agent", message("done?", { createdBy: "agent" }), goalThread],
    ["a slash command", message("/compact?"), goalThread],
    ["a goal that is not active", message("rodou?"), { ...goalThread, goal: null }],
    [
      "a provider that cannot clear its goal",
      message("rodou?"),
      { ...goalThread, driver: ProviderDriverKind.make("antigravity") },
    ],
  ])("leaves %s alone", (_name, command, thread) => {
    expect(planGoalMessage({ command, attention: null, goalThread: thread })).toEqual({
      mutation: null,
      pause: null,
      message: command,
    });
  });

  it.each([
    [
      "an answer turns Needs you into a paused goal",
      message("a senha está no cofre"),
      needsYou,
      { status: "paused", goal: "Ship the release" },
    ],
    [
      "a parent's answer counts too",
      message("ok", { createdBy: "agent", creationSource: "mcp" }),
      needsYou,
      { status: "paused", goal: "Ship the release" },
    ],
    ["a /goal command ends the hold", message("/goal Ship it"), needsYou, null],
    ["a message after Done clears it", message("valeu"), { status: "done", goal: "x" }, null],
  ] as const)("%s", (_name, command, attention, next) => {
    expect(
      planGoalMessage({ command, attention, goalThread: undefined }).mutation?.forkAttention,
    ).toEqual(next);
  });

  it.each([
    [
      "a server wake",
      message("Background task completed", { createdBy: "agent", creationSource: "server" }),
    ],
    ["a paused goal", message("oi")],
  ])("keeps the attention for %s", (name, command) => {
    const attention: ForkThreadAttention =
      name === "a paused goal" ? { status: "paused", goal: "Ship the release" } : needsYou;
    expect(planGoalMessage({ command, attention, goalThread: undefined }).mutation).toBeNull();
  });

  it("acts like upstream with Goal status off", () => {
    using _settings = overrideForkFeatureSettings({ features: { goalStatus: false } });
    const command = message("esses checks rodam no CI?");
    expect(planGoalMessage({ command, attention: needsYou, goalThread })).toEqual({
      mutation: null,
      pause: null,
      message: command,
    });
  });
});
