import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import { paceRemainingPercent } from "@t3tools/shared/usageLimits";

const WEEK_MINS = 7 * 24 * 60;

export function windowDurationMins(window: ServerProviderUsageWindow): number | undefined {
  return window.windowDurationMins ?? (window.kind === "weekly" ? WEEK_MINS : undefined);
}

export function paceMarkerPercent(window: ServerProviderUsageWindow, now: number): number | null {
  const durationMins = windowDurationMins(window);
  if (durationMins === undefined) return null;
  return paceRemainingPercent({ ...window, windowDurationMins: durationMins }, now);
}
