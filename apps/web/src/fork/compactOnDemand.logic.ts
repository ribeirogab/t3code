import { supportsCompactAndContinue } from "@t3tools/contracts";

const GOAL_COMMAND_PATTERN = /^\/goal(?:\s|$)/;

export function goalComposerText(code: string): string {
  const text = code.trim();
  return GOAL_COMMAND_PATTERN.test(text) ? text : `/goal ${text}`;
}

export function compactOnDemandTokens(input: {
  readonly enabled: boolean;
  readonly idleTokens: number | null;
  readonly contextTokens: number | null | undefined;
  readonly driver: string | null | undefined;
  readonly blocked: boolean;
}): number | null {
  if (input.idleTokens !== null) return input.idleTokens;
  const tokens = input.contextTokens ?? 0;
  return input.enabled && !input.blocked && tokens > 0 && supportsCompactAndContinue(input.driver)
    ? tokens
    : null;
}

export function compactOnDemandKeepsHistory(input: {
  readonly idleTokens: number | null;
  readonly keepIdleHistory: boolean;
  readonly armed: boolean;
}): boolean {
  return !input.armed && (input.idleTokens === null || input.keepIdleHistory);
}
