import type { SDKControlGetContextUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vite-plus/test";

import { toForkContextUsage } from "./claudeContextUsage.ts";

const response: SDKControlGetContextUsageResponse = {
  categories: [
    { name: "Legacy row", tokens: 120, color: "grey", kind: "used" },
    { id: "free_space", name: "Free space", tokens: 855_000, color: "grey", kind: "free" },
    {
      id: "system_tools_deferred",
      name: "System tools (deferred)",
      tokens: 4_200,
      color: "grey",
      isDeferred: true,
      kind: "deferred",
    },
    {
      id: "autocompact_buffer",
      name: "Autocompact buffer",
      tokens: 33_000,
      color: "grey",
      kind: "buffer",
    },
    { id: "messages", name: "Messages", tokens: 39_300, color: "blue", kind: "used" },
    {
      id: "mcp_tools_deferred",
      name: "MCP tools (deferred)",
      tokens: 971_600,
      color: "grey",
      isDeferred: true,
      kind: "deferred",
    },
  ],
  totalTokens: 112_000,
  maxTokens: 1_000_000,
  rawMaxTokens: 1_000_000,
  percentage: 11,
  gridRows: [],
  model: "claude-haiku-5-5",
  memoryFiles: [
    { path: "/home/dev/.claude/CLAUDE.md", type: "User", tokens: 1_100 },
    { path: "/work/acme/AGENTS.md", type: "Project", tokens: 3_900 },
  ],
  mcpTools: [
    { name: "search", serverName: "docs", tokens: 900, isLoaded: true },
    { name: "read", serverName: "docs", tokens: 600 },
    { name: "send", serverName: "mail", tokens: 2_000, isLoaded: true },
    { name: "list", serverName: "calendar", tokens: 5_000, isLoaded: false },
  ],
  agents: [],
  isAutoCompactEnabled: true,
  apiUsage: null,
};

describe("toForkContextUsage", () => {
  it("orders the categories used, buffer, free, deferred, by tokens, with the name for a missing id", () => {
    expect(toForkContextUsage(response).categories).toEqual([
      { id: "messages", name: "Messages", tokens: 39_300, kind: "used" },
      { id: "Legacy row", name: "Legacy row", tokens: 120, kind: "used" },
      { id: "autocompact_buffer", name: "Autocompact buffer", tokens: 33_000, kind: "buffer" },
      { id: "free_space", name: "Free space", tokens: 855_000, kind: "free" },
      { id: "mcp_tools_deferred", name: "MCP tools (deferred)", tokens: 971_600, kind: "deferred" },
      {
        id: "system_tools_deferred",
        name: "System tools (deferred)",
        tokens: 4_200,
        kind: "deferred",
      },
    ]);
  });

  it("groups loaded MCP tools by server and drops empty groups", () => {
    expect(toForkContextUsage(response).groups).toEqual([
      {
        id: "mcpTools",
        name: "MCP tools",
        count: 4,
        entries: [
          { name: "mail", tokens: 2_000 },
          { name: "docs", tokens: 1_500 },
        ],
      },
      {
        id: "memoryFiles",
        name: "Memory files",
        count: 2,
        entries: [
          { name: "acme/AGENTS.md", tokens: 3_900 },
          { name: ".claude/CLAUDE.md", tokens: 1_100 },
        ],
      },
    ]);
  });
});
