import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind } from "@t3tools/contracts";

import { compactAndContinueProblem } from "./compactAndContinueRules.ts";

describe("compactAndContinueProblem", () => {
  it.each([
    { driver: "claudeAgent", goal: "The PR is merged", problem: null },
    { driver: "codex", goal: "The PR is merged", problem: null },
    { driver: "opencode", goal: "The PR is merged", problem: "Claude or Codex thread" },
    { driver: "cursor", goal: undefined, problem: "Claude or Codex thread" },
    { driver: undefined, goal: "The PR is merged", problem: "Claude or Codex thread" },
    { driver: "claudeAgent", goal: "clear", problem: "not a /goal control word" },
  ])("$driver with goal $goal", ({ driver, goal, problem }) => {
    const result = compactAndContinueProblem(
      { message: "Continue with wave 2.", goal },
      driver === undefined ? undefined : ProviderDriverKind.make(driver),
    );
    if (problem === null) expect(result).toBeNull();
    else expect(result).toContain(problem);
  });
});
