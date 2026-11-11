import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { paceMarkerPercent } from "./paceMarker";

const HOUR = 3_600_000;
const now = Date.parse("2026-11-10T12:00:00Z");
const resetsAt = new Date(now + 164 * HOUR).toISOString();

const weekly: ServerProviderUsageWindow = {
  id: "seven_day",
  kind: "weekly",
  label: "Weekly",
  usedPercent: 8,
  resetsAt,
};

describe("pace marker", () => {
  it("marks the share of the window left", () => {
    expect(paceMarkerPercent({ ...weekly, windowDurationMins: 168 * 60 }, now)).toBe(98);
    expect(paceMarkerPercent({ ...weekly, windowDurationMins: 328 * 60 }, now)).toBe(50);
  });

  it("assumes seven days for a weekly window without a duration", () => {
    expect(paceMarkerPercent(weekly, now)).toBe(98);
  });

  it("has no marker without a duration or a reset time", () => {
    expect(paceMarkerPercent({ ...weekly, kind: "other" }, now)).toBeNull();
    expect(
      paceMarkerPercent({ ...weekly, windowDurationMins: 300, resetsAt: undefined }, now),
    ).toBeNull();
  });
});
