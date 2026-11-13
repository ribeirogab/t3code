import { assert, describe, it } from "@effect/vitest";
import { MessageId, overrideForkFeatureSettings } from "@t3tools/contracts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as ServerSettings from "../serverSettings.ts";
import {
  agentLanguageLine,
  makeAgentLanguageTurnInput,
  withAgentLanguage,
} from "./agentLanguage.ts";

const language = "Brazilian Portuguese";

function turn(
  message: Pick<
    ProviderAdapter.ProviderAdapterV2TurnMessage,
    "text" | "createdBy" | "creationSource"
  >,
) {
  return { message: { messageId: MessageId.make("message:1"), attachments: [], ...message } };
}

const pullRequestUpdate = turn({
  text: "Update on pull request #7 (https://example.test/acme/app/pull/7), which T3 Code is watching for you:",
  createdBy: "agent",
  creationSource: "server",
});

describe("withAgentLanguage", () => {
  it("adds the language line to text the server or another agent injects", () => {
    const delegatedTask = turn({
      text: "Act as the research sub-agent for this task.\n\nRead the logs.",
      createdBy: "agent",
      creationSource: "mcp",
    });
    for (const input of [pullRequestUpdate, delegatedTask]) {
      assert.equal(
        withAgentLanguage(input, language).message.text,
        `${input.message.text}\n\n${agentLanguageLine(language)}`,
      );
    }
  });

  it("keeps the text as it is without a language, for the user, for provider wakes and for slash commands", () => {
    const unchanged = [
      [pullRequestUpdate, ""],
      [turn({ text: "Fix the login form.", createdBy: "user", creationSource: "web" }), language],
      [turn({ text: "", createdBy: "agent", creationSource: "provider" }), language],
      [
        turn({ text: "Background task done.", createdBy: "agent", creationSource: "provider" }),
        language,
      ],
      [turn({ text: "/compact", createdBy: "agent", creationSource: "server" }), language],
    ] as const;
    for (const [input, setting] of unchanged) {
      assert.strictEqual(withAgentLanguage(input, setting), input);
    }
  });

  it("keeps the text as it is while Fork features is off", () => {
    using _settings = overrideForkFeatureSettings({ master: false });
    assert.strictEqual(withAgentLanguage(pullRequestUpdate, language), pullRequestUpdate);
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
