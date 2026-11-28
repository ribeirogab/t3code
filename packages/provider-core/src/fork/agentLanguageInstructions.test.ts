import { overrideAgentLanguage } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  T3_CODE_ORCHESTRATION_INSTRUCTIONS,
  t3CodeOrchestrationSections,
} from "../server/orchestrationInstructions.ts";
import {
  forkOrchestrationInstructions,
  forkOrchestrationSections,
} from "./agentLanguageInstructions.ts";

describe("agent language instructions", () => {
  it("gives agents the upstream instructions without a language", () => {
    using _language = overrideAgentLanguage("");
    expect(forkOrchestrationSections()).toEqual(t3CodeOrchestrationSections());
    expect(forkOrchestrationSections(false)).toEqual(t3CodeOrchestrationSections(false));
    expect(forkOrchestrationInstructions()).toBe(T3_CODE_ORCHESTRATION_INSTRUCTIONS);
  });

  it("adds the language section after the upstream instructions", () => {
    using _language = overrideAgentLanguage("Brazilian Portuguese");
    expect(forkOrchestrationSections().at(-1)).toContain(
      "Answer the user in Brazilian Portuguese.",
    );
    expect(forkOrchestrationInstructions()).toContain(T3_CODE_ORCHESTRATION_INSTRUCTIONS);
    expect(forkOrchestrationInstructions()).toContain("### Language");
  });
});
