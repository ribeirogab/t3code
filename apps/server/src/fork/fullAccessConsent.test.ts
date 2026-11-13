import { describe, expect, it } from "@effect/vitest";
import {
  overrideForkFeatureSettings,
  ThreadId,
  TurnItemId,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { projectTurnItemForWire } from "../orchestration-v2/WireProjection.ts";

const refusal =
  'Nothing was done. This needs a yes to: "Plan" was made by someone else. Let Claude read it? No one can answer in this session.';

const base = {
  id: TurnItemId.make("tool-1"),
  threadId: ThreadId.make("thread-1"),
  runId: null,
  nodeId: null,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: 1,
  title: null,
  startedAt: DateTime.makeUnsafe("2026-11-09T12:31:47.000Z"),
  completedAt: DateTime.makeUnsafe("2026-11-09T12:31:48.000Z"),
  updatedAt: DateTime.makeUnsafe("2026-11-09T12:31:48.000Z"),
};

const tool = (status: "completed" | "failed", output: unknown): OrchestrationV2TurnItem => ({
  ...base,
  type: "dynamic_tool",
  status,
  toolName: "Artifact",
  input: { action: "read" },
  output,
});

const command = (status: "completed" | "failed", output: string): OrchestrationV2TurnItem => ({
  ...base,
  type: "command_execution",
  status,
  input: "git push",
  output,
});

const wireOutput = (item: OrchestrationV2TurnItem) => {
  const projected = projectTurnItemForWire(item);
  return projected.type === "dynamic_tool" || projected.type === "command_execution"
    ? { output: projected.output, outputOmitted: projected.outputOmitted }
    : null;
};

describe("consent refusal on the wire", () => {
  it("marks a failed tool whose result says no one can answer", () => {
    expect(wireOutput(tool("failed", refusal))?.output).toMatchObject({ forkNeedsYes: true });
    expect(wireOutput(tool("failed", [{ type: "text", text: refusal }]))?.output).toMatchObject({
      forkNeedsYes: true,
    });
    expect(
      wireOutput(tool("failed", { content: [{ type: "text", text: refusal }], isError: true }))
        ?.output,
    ).toMatchObject({ forkNeedsYes: true });
  });

  it("leaves other tool results unmarked", () => {
    expect(wireOutput(tool("failed", "Permission denied"))?.output ?? {}).not.toHaveProperty(
      "forkNeedsYes",
    );
    expect(wireOutput(tool("completed", refusal))?.output ?? {}).not.toHaveProperty("forkNeedsYes");
  });

  it("keeps the refusal of a failed command and still omits other command output", () => {
    expect(wireOutput(command("failed", refusal))).toEqual({
      output: refusal,
      outputOmitted: undefined,
    });
    expect(wireOutput(command("failed", "fatal: not a git repository"))).toEqual({
      output: undefined,
      outputOmitted: true,
    });
    expect(wireOutput(command("completed", refusal))).toEqual({
      output: undefined,
      outputOmitted: true,
    });
  });

  it("projects a refusal as upstream does while Supervised turn is off", () => {
    using _settings = overrideForkFeatureSettings({ features: { supervisedTurn: false } });
    expect(wireOutput(tool("failed", refusal))?.output ?? {}).not.toHaveProperty("forkNeedsYes");
    expect(wireOutput(command("failed", refusal))).toEqual({
      output: undefined,
      outputOmitted: true,
    });
  });
});
