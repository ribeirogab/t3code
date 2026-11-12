import type { ThreadStructure } from "@t3tools/client-runtime/state/shell";
import { MessageId, RunId, ThreadId, TurnItemId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import {
  lastOwnerMessageText,
  runNeedsYes,
  shouldOfferSupervisedTurn,
  turnItemNeedsYes,
} from "./fullAccessConsent";

type TurnItem = ThreadStructure["turnItems"][number];
type Message = ThreadStructure["messages"][number];

const at = DateTime.makeUnsafe("2026-11-09T12:31:48.000Z");
const failedRun = RunId.make("run:failed");
const refusal =
  "Nothing was done. This needs a yes to: read it? No one can answer in this session.";

const itemBase = {
  threadId: ThreadId.make("thread-1"),
  runId: failedRun,
  nodeId: null,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: 1,
  status: "failed" as const,
  title: null,
  startedAt: at,
  completedAt: at,
  updatedAt: at,
};

const tool = (id: string, output: unknown, runId = failedRun): TurnItem => ({
  ...itemBase,
  id: TurnItemId.make(id),
  runId,
  type: "dynamic_tool",
  toolName: "Artifact",
  input: {},
  output,
});

const command = (id: string, output: string | undefined): TurnItem => ({
  ...itemBase,
  id: TurnItemId.make(id),
  type: "command_execution",
  input: "gh pr merge",
  ...(output === undefined ? {} : { output }),
  outputOmitted: output === undefined,
});

const message = (
  id: string,
  role: Message["role"],
  createdBy: Message["createdBy"],
  text: string,
): Message => ({
  id: MessageId.make(id),
  threadId: ThreadId.make("thread-1"),
  runId: null,
  nodeId: null,
  role,
  createdBy,
  creationSource: "web",
  text,
  attachments: [],
  streaming: false,
  createdAt: at,
  updatedAt: at,
});

describe("full access consent refusal", () => {
  it("finds the refusal the server marked on a tool or kept on a command", () => {
    expect(turnItemNeedsYes(tool("t1", { isError: true, forkNeedsYes: true }))).toBe(true);
    expect(turnItemNeedsYes(command("c1", refusal))).toBe(true);
    expect(turnItemNeedsYes(tool("t2", { isError: true }))).toBe(false);
    expect(turnItemNeedsYes(tool("t3", refusal))).toBe(false);
    expect(turnItemNeedsYes(command("c2", undefined))).toBe(false);
  });

  it("looks only at the latest run", () => {
    const items = [tool("t1", { forkNeedsYes: true }, RunId.make("run:old")), tool("t2", {})];
    expect(runNeedsYes(items, failedRun)).toBe(false);
    expect(runNeedsYes(items, RunId.make("run:old"))).toBe(true);
    expect(runNeedsYes(items, null)).toBe(false);
  });

  it("sends the owner's last message again, not a wake or an agent message", () => {
    expect(
      lastOwnerMessageText([
        message("m1", "user", "user", "Read the plan"),
        message("m2", "assistant", "agent", "I can't read it."),
        message("m3", "user", "agent", "Child finished"),
        message("m4", "user", "user", "  "),
      ]),
    ).toBe("Read the plan");
    expect(lastOwnerMessageText([message("m1", "assistant", "agent", "Hi")])).toBeNull();
  });

  it("offers the switch only in Full access, after the turn, with a message to send", () => {
    const offer = {
      enabled: true,
      runtimeMode: "full-access" as const,
      isWorking: false,
      switching: false,
      latestRunNeedsYes: true,
      ownerMessageText: "Read the plan",
    };
    expect(shouldOfferSupervisedTurn(offer)).toBe(true);
    expect(shouldOfferSupervisedTurn({ ...offer, enabled: false })).toBe(false);
    expect(shouldOfferSupervisedTurn({ ...offer, runtimeMode: "approval-required" })).toBe(false);
    expect(shouldOfferSupervisedTurn({ ...offer, isWorking: true })).toBe(false);
    expect(shouldOfferSupervisedTurn({ ...offer, switching: true })).toBe(false);
    expect(shouldOfferSupervisedTurn({ ...offer, latestRunNeedsYes: false })).toBe(false);
    expect(shouldOfferSupervisedTurn({ ...offer, ownerMessageText: null })).toBe(false);
  });
});
