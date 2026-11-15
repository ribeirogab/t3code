import { overrideForkFeatureSettings } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  T3_CODE_ORCHESTRATION_INSTRUCTIONS,
  T3_CODE_ORCHESTRATION_SECTIONS,
  t3OrchestrationPrompt,
} from "../server/orchestrationInstructions.ts";
import {
  forkOrchestrationInstructions,
  forkOrchestrationSections,
  GOAL_WAITS_ON_THE_USER,
  REQUEST_ATTENTION_WHEN_THE_NEXT_STEP_IS_THE_USERS,
} from "./orchestrationRules.ts";

const FORK_RULE = "- Recurring or timed work: `schedule_task`, not `CronCreate`.";

describe("fork orchestration rules", () => {
  it("adds the fork rules to every instruction format while Orchestration rules is on", () => {
    expect(forkOrchestrationSections()).toHaveLength(T3_CODE_ORCHESTRATION_SECTIONS.length);
    expect(forkOrchestrationSections().join("\n")).toContain(FORK_RULE);
    expect(forkOrchestrationInstructions()).toContain(FORK_RULE);
    expect(forkOrchestrationInstructions()).toContain(GOAL_WAITS_ON_THE_USER);
    expect(forkOrchestrationInstructions()).toContain(
      REQUEST_ATTENTION_WHEN_THE_NEXT_STEP_IS_THE_USERS,
    );
    expect(forkOrchestrationInstructions()).not.toContain("with your question tool");
    expect(forkOrchestrationInstructions()).toContain(
      "never a background `Agent`. A thread the user asked to run apart: `delegate_task` with `listed:true`",
    );
    expect(forkOrchestrationInstructions().length).toBeGreaterThan(
      T3_CODE_ORCHESTRATION_INSTRUCTIONS.length,
    );
  });

  it.each([
    { master: false, features: {} },
    { master: true, features: { orchestrationRules: false } },
  ])("gives agents the upstream instructions with %o", (settings) => {
    using _settings = overrideForkFeatureSettings(settings);
    expect(forkOrchestrationSections()).toBe(T3_CODE_ORCHESTRATION_SECTIONS);
    expect(forkOrchestrationInstructions()).toBe(T3_CODE_ORCHESTRATION_INSTRUCTIONS);
    const prompt = t3OrchestrationPrompt({
      prompt: "Fix it.",
      hasT3Mcp: true,
      hasDeviceTools: false,
      orchestrationDelivered: false,
      deviceInstructionsDelivered: false,
    });
    expect(prompt).toContain(T3_CODE_ORCHESTRATION_INSTRUCTIONS.trim());
    expect(prompt).not.toContain(FORK_RULE);
  });

  it("leaves out the goal rule while Goal status is off", () => {
    using _settings = overrideForkFeatureSettings({ features: { goalStatus: false } });
    expect(forkOrchestrationInstructions()).toContain(FORK_RULE);
    expect(forkOrchestrationInstructions()).not.toContain(GOAL_WAITS_ON_THE_USER);
  });

  it("keeps the question tool rule while Request attention is off", () => {
    using _settings = overrideForkFeatureSettings({ features: { requestAttention: false } });
    expect(forkOrchestrationInstructions()).toContain("with your question tool");
    expect(forkOrchestrationInstructions()).not.toContain(
      REQUEST_ATTENTION_WHEN_THE_NEXT_STEP_IS_THE_USERS,
    );
  });
});
