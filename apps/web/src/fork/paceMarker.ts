import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import { paceRemainingPercent } from "@t3tools/shared/usageLimits";

const WEEK_MINS = 7 * 24 * 60;

export function paceMarkerPercent(window: ServerProviderUsageWindow, now: number): number | null {
  const windowDurationMins =
    window.windowDurationMins ?? (window.kind === "weekly" ? WEEK_MINS : undefined);
  if (windowDurationMins === undefined) return null;
  return paceRemainingPercent({ ...window, windowDurationMins }, now);
}
