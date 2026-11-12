import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type * as ServerSettings from "../serverSettings.ts";

type TurnMessage = ProviderAdapter.ProviderAdapterV2TurnMessage;

export const agentLanguageLine = (language: string) => `Answer the user in ${language}.`;

const isSlashCommand = (text: string) => text.trimStart().startsWith("/");

const isInjectedText = (message: TurnMessage) =>
  message.createdBy !== "user" &&
  message.creationSource !== "provider" &&
  message.text.trim() !== "" &&
  !isSlashCommand(message.text);

export function withAgentLanguage<Input extends { readonly message: TurnMessage }>(
  input: Input,
  language: string,
): Input {
  if (language === "" || !isInjectedText(input.message)) return input;
  return {
    ...input,
    message: { ...input.message, text: `${input.message.text}\n\n${agentLanguageLine(language)}` },
  };
}

export function makeAgentLanguageTurnInput(
  serverSettings: Option.Option<ServerSettings.ServerSettingsService["Service"]>,
) {
  const agentLanguage = Option.isNone(serverSettings)
    ? Effect.succeed("")
    : serverSettings.value.getSettings.pipe(
        Effect.map((settings) => settings.agentLanguage),
        Effect.orElseSucceed(() => ""),
      );
  return <Input extends { readonly message: TurnMessage }>(input: Input) =>
    Effect.map(agentLanguage, (language) => withAgentLanguage(input, language));
}
