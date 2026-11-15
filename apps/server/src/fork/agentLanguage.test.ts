import { assert, describe, it } from "@effect/vitest";
import {
  agentLanguageLine,
  MessageId,
  overrideAgentLanguage,
  overrideForkFeatureSettings,
  ThreadId,
} from "@t3tools/contracts";
import {
  forkOrchestrationInstructions,
  forkOrchestrationSections,
} from "@t3tools/provider-core/server/orchestrationInstructions";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { buildCodexAdditionalContext } from "../provider/CodexDeveloperInstructions.ts";
import * as ServerSettings from "../serverSettings.ts";
import { makeAgentLanguageTurnInput, withAgentLanguage } from "./agentLanguage.ts";

const language = "Brazilian Portuguese";

function turn(
  message: Pick<
    ProviderAdapter.ProviderAdapterV2TurnMessage,
    "text" | "createdBy" | "creationSource" | "senderThreadId"
  >,
) {
  return { message: { messageId: MessageId.make("message:1"), attachments: [], ...message } };
}

const pullRequestUpdate = turn({
  text: "Update on pull request #7 (https://example.test/acme/app/pull/7), which T3 Code is watching for you:",
  createdBy: "agent",
  creationSource: "server",
});

const serverWakes = [
  [
    "child finished",
    turn({
      text: "Delegated task node:delegated-task:a1 reached a terminal state. Use task_status with taskId node:delegated-task:a1 to read the result.",
      createdBy: "agent",
      creationSource: "server",
    }),
  ],
  [
    "child question",
    turn({
      text: "Delegated task node:delegated-task:a1 is blocked on a question and cannot continue until it is answered.",
      createdBy: "agent",
      creationSource: "server",
    }),
  ],
  ["pull request watch", pullRequestUpdate],
  [
    "workflow run watch",
    turn({
      text: "The CI runs of acme/app at 1a2b3c4 ended. T3 Code was watching them for you:",
      createdBy: "agent",
      creationSource: "server",
    }),
  ],
  [
    "background work",
    turn({
      text: "Background command completed (exit 0): vp test run",
      createdBy: "agent",
      creationSource: "server",
    }),
  ],
  [
    "server restart note",
    turn({
      text: "Note: the T3 server restarted, and this background work was cancelled.",
      createdBy: "agent",
      creationSource: "server",
    }),
  ],
  [
    "message from another thread",
    turn({
      text: "Zeno round 1 on PR #7: one blocker, valid. Apply it.",
      createdBy: "agent",
      creationSource: "mcp",
      senderThreadId: ThreadId.make("thread:sender"),
    }),
  ],
  [
    "delegated task brief",
    turn({
      text: "Act as the research sub-agent for this task.\n\nRead the logs.",
      createdBy: "agent",
      creationSource: "mcp",
    }),
  ],
] as const;

const sessionLanguageRule = `${agentLanguageLine(language)} This holds for every reply, also after a notification, a compaction, a goal continuation, or long output in another language.`;

describe("withAgentLanguage", () => {
  it.each(serverWakes)("adds the language line to the %s wake", (_kind, input) => {
    assert.equal(
      withAgentLanguage(input, language).message.text,
      `${input.message.text}\n\n${agentLanguageLine(language)}`,
    );
  });

  it("keeps every wake as it is without a language or while Fork features is off", () => {
    for (const [, input] of serverWakes) {
      assert.strictEqual(withAgentLanguage(input, ""), input);
    }
    using _settings = overrideForkFeatureSettings({ master: false });
    for (const [, input] of serverWakes) {
      assert.strictEqual(withAgentLanguage(input, language), input);
    }
  });

  it("keeps the text as it is for the user, for provider wakes and for slash commands", () => {
    const unchanged = [
      turn({ text: "Fix the login form.", createdBy: "user", creationSource: "web" }),
      turn({ text: "", createdBy: "agent", creationSource: "provider" }),
      turn({ text: "Background task completed.", createdBy: "agent", creationSource: "provider" }),
      turn({ text: "/compact", createdBy: "agent", creationSource: "server" }),
      turn({ text: "/goal The tests pass.", createdBy: "agent", creationSource: "mcp" }),
    ];
    for (const input of unchanged) {
      assert.strictEqual(withAgentLanguage(input, language), input);
    }
  });
});

describe("session instructions", () => {
  it("carry the language for wakes the provider makes itself", () => {
    const withoutLanguage = forkOrchestrationInstructions();
    using _language = overrideAgentLanguage(language);
    assert.equal(
      forkOrchestrationInstructions(),
      `${withoutLanguage}\n### Language\n\n- ${sessionLanguageRule}\n`,
    );
    assert.equal(forkOrchestrationSections().at(-1), `### Language\n\n- ${sessionLanguageRule}`);
    const codexContext = Object.values(buildCodexAdditionalContext({ model: "gpt-5" }));
    assert.isTrue(codexContext.some((entry) => entry.value.includes(sessionLanguageRule)));
  });

  it.each([
    ["without a language", "", true],
    ["while Fork features is off", language, false],
  ] as const)("keep the instructions as they are %s", (_case, setting, master) => {
    using _settings = overrideForkFeatureSettings({ master });
    const instructions = forkOrchestrationInstructions();
    const sections = forkOrchestrationSections();
    using _language = overrideAgentLanguage(setting);
    assert.equal(forkOrchestrationInstructions(), instructions);
    assert.strictEqual(forkOrchestrationSections(), sections);
    const codexContext = Object.values(buildCodexAdditionalContext({ model: "gpt-5" }));
    assert.isFalse(codexContext.some((entry) => entry.value.includes(sessionLanguageRule)));
  });
});

describe("makeAgentLanguageTurnInput", () => {
  it.effect("reads the language from the server settings", () =>
    Effect.gen(function* () {
      const settings = yield* ServerSettings.ServerSettingsService;
      const withLanguage = makeAgentLanguageTurnInput(Option.some(settings));
      const input = yield* withLanguage(pullRequestUpdate);
      assert.include(input.message.text, agentLanguageLine(language));
    }).pipe(Effect.provide(ServerSettings.layerTest({ agentLanguage: language }))),
  );

  it.effect("keeps the text as it is when the server settings are absent", () =>
    Effect.gen(function* () {
      const input = yield* makeAgentLanguageTurnInput(Option.none())(pullRequestUpdate);
      assert.strictEqual(input, pullRequestUpdate);
    }),
  );
});
