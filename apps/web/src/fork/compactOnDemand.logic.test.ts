import { describe, expect, it } from "vite-plus/test";

import {
  compactOnDemandKeepsHistory,
  compactOnDemandTokens,
  goalComposerText,
} from "./compactOnDemand.logic";

describe("goalComposerText", () => {
  it.each([
    ["Release v1.2 is published.\n", "/goal Release v1.2 is published."],
    [
      "/goal Release v1.2 is published.\nProof: CI green.\n",
      "/goal Release v1.2 is published.\nProof: CI green.",
    ],
    ["/goalkeeper drill", "/goal /goalkeeper drill"],
  ])("%j becomes %j", (code, text) => {
    expect(goalComposerText(code)).toBe(text);
  });
});

describe("compactOnDemandTokens", () => {
  const onDemand = {
    enabled: true,
    idleTokens: null,
    contextTokens: 182_000,
    driver: "claudeAgent",
    blocked: false,
  };

  it.each([
    ["Claude with context", onDemand, 182_000],
    ["Codex with context", { ...onDemand, driver: "codex" }, 182_000],
    ["feature off", { ...onDemand, enabled: false }, null],
    ["OpenCode", { ...onDemand, driver: "opencode" }, null],
    ["no context window", { ...onDemand, contextTokens: null }, null],
    ["empty context", { ...onDemand, contextTokens: 0 }, null],
    ["compaction blocked", { ...onDemand, blocked: true }, null],
    ["idle compaction offered", { ...onDemand, enabled: false, idleTokens: 90_000 }, 90_000],
  ])("%s", (_name, input, tokens) => {
    expect(compactOnDemandTokens(input)).toBe(tokens);
  });
});

describe("compactOnDemandKeepsHistory", () => {
  it.each([
    ["on demand starts off", { idleTokens: null, keepIdleHistory: false, armed: false }, true],
    ["Use as goal turns it on", { idleTokens: null, keepIdleHistory: false, armed: true }, false],
    [
      "idle compaction compacts",
      { idleTokens: 90_000, keepIdleHistory: false, armed: false },
      false,
    ],
    ["idle Keep choice", { idleTokens: 90_000, keepIdleHistory: true, armed: false }, true],
    ["Use as goal beats Keep", { idleTokens: 90_000, keepIdleHistory: true, armed: true }, false],
  ])("%s", (_name, input, keeps) => {
    expect(compactOnDemandKeepsHistory(input)).toBe(keeps);
  });
});
