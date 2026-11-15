import { describe, expect, it } from "@effect/vitest";
import {
  MessageId,
  NodeId,
  overrideForkFeatureSettings,
  RunId,
  ThreadId,
  type ForkNotifyParent,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  askTheUserForChildQuestion,
  childEventWakesParent,
  isSlashCommandOnly,
  mayWakeParentOnFinish,
  questionWakesParent,
  quietCompletion,
  type ChildTurnReader,
  type ChildWakeEvent,
  type TurnStarter,
} from "./notifyParent.ts";
import { ProjectionStoreThreadNotFoundError } from "../orchestration-v2/ProjectionStore.ts";

const parentThreadId = ThreadId.make("thread:parent");
const parentAgent: TurnStarter = {
  createdBy: "agent",
  creationSource: "mcp",
  senderThreadId: parentThreadId,
  text: "Review the diff.",
};
const owner: TurnStarter = { createdBy: "user", creationSource: "web", text: "Rename the button." };
const ownerOnMobile: TurnStarter = { ...owner, creationSource: "mobile" };
const ownerFromParent: TurnStarter = { ...owner, senderThreadId: parentThreadId };
const answer: TurnStarter = { createdBy: "user", creationSource: "server", text: "Use main." };
const slashFromParent: TurnStarter = { ...parentAgent, text: "/reload-skills" };
const waitingOnUser = {
  forkAttention: { status: "needs_user", reason: "Approve the deploy" },
} as const;

describe("childEventWakesParent", () => {
  const cases: ReadonlyArray<
    readonly [ForkNotifyParent | undefined, ChildWakeEvent, TurnStarter | undefined, boolean]
  > = [
    [undefined, "finish", parentAgent, true],
    [undefined, "question", parentAgent, true],
    ["on_finish", "finish", parentAgent, true],
    ["on_finish", "question", parentAgent, true],
    ["on_question", "finish", parentAgent, false],
    ["on_question", "question", parentAgent, true],
    ["never", "finish", parentAgent, false],
    ["never", "question", parentAgent, false],
    [undefined, "finish", owner, false],
    [undefined, "question", owner, false],
    ["on_question", "question", owner, false],
    [undefined, "finish", ownerOnMobile, false],
    [undefined, "finish", ownerFromParent, true],
    [undefined, "finish", answer, true],
    ["on_question", "finish", answer, false],
    [undefined, "finish", slashFromParent, false],
    ["on_question", "question", slashFromParent, false],
    [undefined, "finish", undefined, true],
    ["never", "finish", undefined, false],
    ["on_close", "finish", parentAgent, false],
    ["on_close", "question", parentAgent, false],
  ];

  it.each(cases)(
    "notifyParent %s, %s, starter %o wakes: %s",
    (notifyParent, event, starter, wakes) => {
      expect(childEventWakesParent({ notifyParent, event, starter })).toBe(wakes);
    },
  );

  it.each([
    { master: false, features: {} },
    { master: true, features: { quietParentWake: false } },
  ])("wakes the parent for every child event, as upstream does, with %o", (settings) => {
    using _settings = overrideForkFeatureSettings(settings);
    for (const [notifyParent, event, starter] of cases) {
      expect(childEventWakesParent({ notifyParent, event, starter })).toBe(true);
    }
    expect(mayWakeParentOnFinish({ notifyParent: "never" })).toBe(true);
    expect(
      quietCompletion(
        { notifyParent: "never" },
        { userMessageId: MessageId.make("m") },
        [{ id: MessageId.make("m"), ...owner }],
        "completed",
        {},
      ),
    ).toEqual({});
  });
});

describe("askTheUserForChildQuestion", () => {
  it.each([
    [{}, "ask the user in your reply, call t3_request_attention, end your turn"],
    [{ requestAttention: false }, "ask the user with your question tool"],
    [{ requestAttention: false, orchestrationRules: false }, "ask the user"],
  ])("with %o: %s", (features, text) => {
    using _settings = overrideForkFeatureSettings({ features });
    expect(askTheUserForChildQuestion()).toBe(text);
  });
});

describe("isSlashCommandOnly", () => {
  it.each([
    ["/goal", true],
    ["  /compact  ", true],
    ["/goal fix the login test", true],
    ["/fn:deploy-staging", true],
    ["/home/user/app is broken", false],
    ["Run /goal later", false],
    ["//", false],
    ["", false],
  ])("%j: %s", (text, expected) => {
    expect(isSlashCommandOnly(text)).toBe(expected);
  });
});

describe("mayWakeParentOnFinish", () => {
  it.each([
    [undefined, true],
    ["on_finish", true],
    ["on_question", false],
    ["never", false],
  ] as const)("notifyParent %s: %s", (notifyParent, expected) => {
    expect(mayWakeParentOnFinish({ notifyParent })).toBe(expected);
  });
});

describe("quietCompletion", () => {
  const starterId = MessageId.make("message:child:2");
  const message = (starter: TurnStarter) => [
    { id: MessageId.make("message:child:1"), ...parentAgent, text: "Start." },
    { id: starterId, ...starter },
  ];
  const disposed = { completionDelivery: { state: "disposed", observedByRunId: null } };

  it("keeps the wake for a run the parent started", () => {
    expect(
      quietCompletion({}, { userMessageId: starterId }, message(parentAgent), "completed", {}),
    ).toEqual({});
  });

  it("disposes the delivery of a run the owner started in the child", () => {
    expect(
      quietCompletion({}, { userMessageId: starterId }, message(owner), "completed", {}),
    ).toEqual(disposed);
  });

  it("disposes the delivery of a slash command turn", () => {
    expect(
      quietCompletion({}, { userMessageId: starterId }, message(slashFromParent), "completed", {}),
    ).toEqual(disposed);
  });

  it("follows the option when the starter message is not loaded", () => {
    expect(
      quietCompletion({ notifyParent: "never" }, { userMessageId: starterId }, [], "completed", {}),
    ).toEqual(disposed);
  });

  it("disposes the delivery of a run that ends waiting on the user", () => {
    expect(
      quietCompletion(
        {},
        { userMessageId: starterId },
        message(parentAgent),
        "completed",
        waitingOnUser,
      ),
    ).toEqual({
      completionDelivery: { state: "disposed", observedByRunId: null },
    });
    using _settings = overrideForkFeatureSettings({ features: { requestAttention: false } });
    expect(
      quietCompletion(
        {},
        { userMessageId: starterId },
        message(parentAgent),
        "completed",
        waitingOnUser,
      ),
    ).toEqual({});
  });

  it.each([
    [{ notifyParent: "never" as const }, message(parentAgent)],
    [{ notifyParent: "on_question" as const }, message(parentAgent)],
    [{ notifyParent: "on_close" as const }, message(parentAgent)],
    [{}, message(owner)],
    [{}, message(slashFromParent)],
  ])("keeps the wake of a failed child with %o", (task, messages) => {
    expect(
      quietCompletion(task, { userMessageId: starterId }, messages, "failed", waitingOnUser),
    ).toEqual({});
  });

  it.each(["interrupted", "cancelled"] as const)(
    "stays quiet for a child that ends %s",
    (outcome) => {
      expect(
        quietCompletion({ notifyParent: "never" }, { userMessageId: starterId }, [], outcome, {}),
      ).toEqual(disposed);
    },
  );
});

describe("questionWakesParent", () => {
  const childThreadId = ThreadId.make("thread:child");
  const nodeId = NodeId.make("node:child:question");
  const runId = RunId.make("run:child:2");

  const reader = (
    runIdOfNode: RunId | null,
    starter: TurnStarter | undefined,
  ): ChildTurnReader => ({
    getThreadRecords: (threadId, _fields, filter) =>
      Effect.succeed({
        nodes:
          threadId === childThreadId && filter.nodeIds.includes(nodeId)
            ? [{ runId: runIdOfNode }]
            : [],
      }),
    getRunMessage: (threadId, id) =>
      Effect.succeed(threadId === childThreadId && id === runId ? starter : undefined),
  });

  it.effect("stays quiet for a question in a turn the owner started", () =>
    Effect.gen(function* () {
      const wakes = yield* questionWakesParent(
        reader(runId, owner),
        { childThreadId, notifyParent: undefined },
        { nodeId },
      );
      expect(wakes).toBe(false);
    }),
  );

  it.effect("wakes an on_question parent for a question in its own turn", () =>
    Effect.gen(function* () {
      const wakes = yield* questionWakesParent(
        reader(runId, parentAgent),
        { childThreadId, notifyParent: "on_question" },
        { nodeId },
      );
      expect(wakes).toBe(true);
    }),
  );

  it.effect("follows the option when the question has no run", () =>
    Effect.gen(function* () {
      const wakes = yield* questionWakesParent(
        reader(null, owner),
        { childThreadId, notifyParent: "never" },
        { nodeId },
      );
      expect(wakes).toBe(false);
    }),
  );

  it.effect("follows the option when the child records cannot be read", () =>
    Effect.gen(function* () {
      const failing: ChildTurnReader = {
        getThreadRecords: (threadId) =>
          Effect.fail(new ProjectionStoreThreadNotFoundError({ threadId })),
        getRunMessage: () => Effect.undefined,
      };
      const quiet = yield* questionWakesParent(
        failing,
        { childThreadId, notifyParent: "never" },
        { nodeId },
      );
      const wakes = yield* questionWakesParent(
        failing,
        { childThreadId, notifyParent: undefined },
        { nodeId },
      );
      expect([quiet, wakes]).toEqual([false, true]);
    }),
  );
});
