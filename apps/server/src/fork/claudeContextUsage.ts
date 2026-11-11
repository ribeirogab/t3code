import type { SDKControlGetContextUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import type {
  ForkContextUsage,
  ForkContextUsageEntry,
  ForkContextUsageGroup,
  OrchestrationV2ProviderThread,
  ProviderDriverKind,
} from "@t3tools/contracts";
import * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as Effect from "effect/Effect";

interface ClaudeContextUsageQuery {
  readonly stopping: boolean;
  readonly nativeThreadId: string;
  readonly query: {
    readonly getContextUsage?: Effect.Effect<SDKControlGetContextUsageResponse, Error>;
  };
}

const byTokens = (left: ForkContextUsageEntry, right: ForkContextUsageEntry) =>
  right.tokens - left.tokens;

function shortPath(path: string): string {
  return path.split("/").filter(Boolean).slice(-2).join("/");
}

function mcpServerEntries(tools: SDKControlGetContextUsageResponse["mcpTools"]) {
  const tokensByServer = new Map<string, number>();
  for (const tool of tools) {
    if (tool.isLoaded === false) continue;
    tokensByServer.set(tool.serverName, (tokensByServer.get(tool.serverName) ?? 0) + tool.tokens);
  }
  return [...tokensByServer]
    .map(([name, tokens]) => ({ name, tokens }))
    .filter((entry) => entry.tokens > 0)
    .toSorted(byTokens);
}

export function toForkContextUsage(response: SDKControlGetContextUsageResponse): ForkContextUsage {
  const groups: ForkContextUsageGroup[] = [
    {
      id: "mcpTools",
      name: "MCP tools",
      count: response.mcpTools.length,
      entries: mcpServerEntries(response.mcpTools),
    },
    {
      id: "memoryFiles",
      name: "Memory files",
      count: response.memoryFiles.length,
      entries: response.memoryFiles
        .map((file) => ({ name: shortPath(file.path), tokens: file.tokens }))
        .toSorted(byTokens),
    },
    {
      id: "agents",
      name: "Custom agents",
      count: response.agents.length,
      entries: response.agents
        .map((agent) => ({ name: agent.agentType, tokens: agent.tokens }))
        .toSorted(byTokens),
    },
  ];
  return {
    totalTokens: response.totalTokens,
    maxTokens: response.maxTokens,
    categories: response.categories.map((category) => ({
      id: category.id ?? category.name,
      name: category.name,
      tokens: category.tokens,
      kind: category.kind,
    })),
    groups: groups.filter((group) => group.count > 0),
  };
}

export const readClaudeContextUsage = Effect.fn("ForkClaudeContextUsage.read")(function* (input: {
  readonly driver: ProviderDriverKind;
  readonly liveQuery: ClaudeContextUsageQuery | null;
  readonly providerThread: OrchestrationV2ProviderThread;
}) {
  const { liveQuery } = input;
  if (
    liveQuery === null ||
    liveQuery.stopping ||
    liveQuery.nativeThreadId !== input.providerThread.nativeThreadRef?.nativeId
  ) {
    return yield* new ProviderAdapter.ProviderAdapterSessionStoppedError({
      driver: input.driver,
    });
  }
  const getContextUsage = liveQuery.query.getContextUsage;
  if (getContextUsage === undefined) {
    return yield* new ProviderAdapter.ProviderAdapterProtocolError({
      driver: input.driver,
      detail: "This Claude process does not report context usage.",
    });
  }
  const response = yield* getContextUsage.pipe(
    Effect.mapError(
      (cause) =>
        new ProviderAdapter.ProviderAdapterProtocolError({
          driver: input.driver,
          detail: "Failed to read Claude context usage.",
          cause,
        }),
    ),
  );
  return toForkContextUsage(response);
});
