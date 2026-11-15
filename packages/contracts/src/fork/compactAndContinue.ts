const COMPACT_AND_CONTINUE_DRIVERS: ReadonlySet<string> = new Set(["claudeAgent", "codex"]);

export function supportsCompactAndContinue(driver: string | null | undefined): boolean {
  return driver != null && COMPACT_AND_CONTINUE_DRIVERS.has(driver);
}
