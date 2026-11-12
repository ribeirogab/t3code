import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { formatPaceDelta, providerPace, weeklyProjection, weeklyWindow } from "./providerUsagePace";

const HOUR = 3_600_000;
const now = Date.parse("2026-11-10T12:00:00Z");

function weekly(usedPercent: number, hoursToReset: number): ServerProviderUsageWindow {
  return {
    id: "seven_day",
    kind: "weekly",
    label: "Weekly",
    usedPercent,
    resetsAt: new Date(now + hoursToReset * HOUR).toISOString(),
    windowDurationMins: 168 * 60,
  };
}

describe("provider pace", () => {
  it.each([
    { used: 45, hours: 151, delta: -35, kind: "deficit", segment: { start: 55, width: 35 } },
    { used: 9, hours: 82, delta: 42, kind: "reserve", segment: { start: 49, width: 42 } },
    { used: 26, hours: 116, delta: 5, kind: "even", segment: null },
    { used: 36, hours: 116, delta: -5, kind: "even", segment: null },
    { used: 37, hours: 116, delta: -6, kind: "deficit", segment: { start: 63, width: 6 } },
    { used: 100, hours: 84, delta: -50, kind: "deficit", segment: { start: 0, width: 50 } },
  ])("compares the quota left with the window left: %o", (row) => {
    expect(providerPace(weekly(row.used, row.hours), now)).toMatchObject({
      delta: row.delta,
      kind: row.kind,
      segment: row.segment,
    });
  });

  it("has no pace without a reset time", () => {
    expect(providerPace({ ...weekly(10, 10), resetsAt: undefined }, now)).toBeNull();
  });

  it("formats the delta with a sign", () => {
    expect([42, -6, 0].map(formatPaceDelta)).toEqual(["+42%", "−6%", "0%"]);
  });

  it("prefers the all-models weekly window over a scoped one", () => {
    const scoped = { ...weekly(10, 10), id: "seven_day_fable", label: "Weekly · Fable" };
    const session = { ...weekly(10, 1), id: "five_hour", kind: "session" as const };
    expect(weeklyWindow([session, scoped, weekly(20, 10)])?.id).toBe("seven_day");
    expect(weeklyWindow([session, scoped])?.id).toBe("seven_day_fable");
    expect(weeklyWindow([session])).toBeUndefined();
  });

  it.each([
    { used: 45, hours: 151, projection: { kind: "runsOut", inMs: (55 * 17 * HOUR) / 45 } },
    { used: 9, hours: 82, projection: { kind: "leftAtReset", percent: 82, estimated: true } },
    { used: 0, hours: 82, projection: { kind: "leftAtReset", percent: 100, estimated: false } },
    { used: 5, hours: 168, projection: { kind: "leftAtReset", percent: 95, estimated: false } },
    { used: 100, hours: 84, projection: { kind: "runsOut", inMs: 0 } },
  ])("projects the burn rate to the reset: %o", (row) => {
    expect(weeklyProjection(weekly(row.used, row.hours), now)).toEqual(row.projection);
  });

  it("has no projection without a reset time", () => {
    expect(weeklyProjection({ ...weekly(10, 10), resetsAt: undefined }, now)).toBeNull();
  });
});
