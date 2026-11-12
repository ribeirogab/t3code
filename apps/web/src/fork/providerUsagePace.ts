import type {
  ServerProvider,
  ServerProviderUsageWindow,
  UsageLimitSourceSnapshots,
  UsageLimitsReport,
} from "@t3tools/contracts";
import {
  collectProviderUsageLimits,
  limitsNotice,
  remainingPercent,
} from "@t3tools/shared/usageLimits";

import { paceMarkerPercent, windowDurationMins } from "./paceMarker";

const EVEN_PACE_BAND = 5;
const MINUTE = 60_000;

export type ProviderPaceKind = "deficit" | "reserve" | "even";

export interface ProviderPace {
  readonly left: number;
  readonly tick: number;
  readonly delta: number;
  readonly kind: ProviderPaceKind;
  readonly segment: { readonly start: number; readonly width: number } | null;
}

export interface ProviderUsageEntry {
  readonly account: UsageLimitsReport["accounts"][number];
  readonly weekly: ServerProviderUsageWindow;
}

export function weeklyWindow(
  windows: ReadonlyArray<ServerProviderUsageWindow>,
): ServerProviderUsageWindow | undefined {
  const weekly = windows.filter((window) => window.kind === "weekly");
  return weekly.find((window) => window.label === "Weekly") ?? weekly[0];
}

export function providerPace(window: ServerProviderUsageWindow, now: number): ProviderPace | null {
  const tick = paceMarkerPercent(window, now);
  if (tick === null) return null;
  const left = remainingPercent(window);
  const delta = left - tick;
  const kind: ProviderPaceKind =
    delta < -EVEN_PACE_BAND ? "deficit" : delta > EVEN_PACE_BAND ? "reserve" : "even";
  return {
    left,
    tick,
    delta,
    kind,
    segment: kind === "even" ? null : { start: Math.min(left, tick), width: Math.abs(delta) },
  };
}

export type WeeklyProjection =
  | { readonly kind: "runsOut"; readonly inMs: number }
  | { readonly kind: "leftAtReset"; readonly percent: number; readonly estimated: boolean };

export function weeklyProjection(
  window: ServerProviderUsageWindow,
  now: number,
): WeeklyProjection | null {
  const durationMins = windowDurationMins(window);
  const resetsAt = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;
  if (durationMins === undefined || !Number.isFinite(resetsAt)) return null;
  const used = Math.max(0, Math.min(100, window.usedPercent));
  const left = 100 - used;
  const untilReset = Math.max(0, resetsAt - now);
  const elapsed = durationMins * MINUTE - untilReset;
  if (left <= 0) return { kind: "runsOut", inMs: 0 };
  if (elapsed <= 0 || used <= 0) {
    return { kind: "leftAtReset", percent: Math.round(left), estimated: false };
  }
  const usedPerMs = used / elapsed;
  const untilEmpty = left / usedPerMs;
  if (untilEmpty < untilReset) return { kind: "runsOut", inMs: untilEmpty };
  return {
    kind: "leftAtReset",
    percent: Math.round(left - usedPerMs * untilReset),
    estimated: true,
  };
}

export function formatPaceDelta(delta: number): string {
  if (delta > 0) return `+${delta}%`;
  if (delta < 0) return `−${-delta}%`;
  return "0%";
}

/** One entry per provider login, in provider order, using the dedupe of the usage limits report. */
export function collectProviderUsageEntries(
  providers: readonly ServerProvider[],
  sources: UsageLimitSourceSnapshots,
  now: number,
): readonly ProviderUsageEntry[] {
  const instanceByDriver = new Map<ServerProvider["driver"], ServerProvider["instanceId"]>();
  for (const provider of providers) {
    if (provider.enabled && !instanceByDriver.has(provider.driver)) {
      instanceByDriver.set(provider.driver, provider.instanceId);
    }
  }
  return [...instanceByDriver.values()].flatMap((instanceId) =>
    (collectProviderUsageLimits(instanceId, providers, sources, now)?.accounts ?? []).flatMap(
      (account) => {
        if (account.instanceId === undefined || limitsNotice(account.limits) !== null) return [];
        const weekly = weeklyWindow(account.limits.windows);
        return weekly ? [{ account, weekly }] : [];
      },
    ),
  );
}
