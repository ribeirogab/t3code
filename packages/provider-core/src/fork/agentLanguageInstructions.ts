import { agentLanguageLine, forkAgentLanguage } from "@t3tools/contracts";

import {
  T3_CODE_ORCHESTRATION_INSTRUCTIONS,
  t3CodeOrchestrationSections,
} from "../server/orchestrationInstructions.ts";

const upstreamSections = new Map<boolean, ReadonlyArray<string>>();

function upstreamOrchestrationSections(nativeSubagents: boolean): ReadonlyArray<string> {
  const cached = upstreamSections.get(nativeSubagents);
  if (cached !== undefined) return cached;
  const sections = t3CodeOrchestrationSections(nativeSubagents);
  upstreamSections.set(nativeSubagents, sections);
  return sections;
}

function agentLanguageSection(): string | undefined {
  const language = forkAgentLanguage();
  return language === ""
    ? undefined
    : `### Language\n\n- ${agentLanguageLine(language)} This holds for every reply, also after a notification, a compaction, a goal continuation, or long output in another language.`;
}

export function forkOrchestrationSections(nativeSubagents = true): ReadonlyArray<string> {
  const sections = upstreamOrchestrationSections(nativeSubagents);
  const language = agentLanguageSection();
  return language === undefined ? sections : [...sections, language];
}

export function forkOrchestrationInstructions(): string {
  const language = agentLanguageSection();
  return language === undefined
    ? T3_CODE_ORCHESTRATION_INSTRUCTIONS
    : `${T3_CODE_ORCHESTRATION_INSTRUCTIONS}\n${language}\n`;
}
