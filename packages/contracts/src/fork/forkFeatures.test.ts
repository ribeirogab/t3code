import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_FORK_FEATURE_SETTINGS,
  forkFeatureActive,
  isForkFeatureOn,
  onForkFeatureSettingsChange,
  overrideForkFeatureSettings,
} from "./forkFeatures.ts";

describe("isForkFeatureOn", () => {
  it("turns every feature on by default and off with the master switch", () => {
    expect(isForkFeatureOn(DEFAULT_FORK_FEATURE_SETTINGS, "parkedThreads")).toBe(true);
    expect(isForkFeatureOn({ master: false, features: {} }, "parkedThreads")).toBe(false);
    expect(
      isForkFeatureOn({ master: false, features: { parkedThreads: true } }, "parkedThreads"),
    ).toBe(false);
  });

  it("turns off only the feature stored as false", () => {
    const settings = { master: true, features: { publishedPorts: false, retired: false } };
    expect(isForkFeatureOn(settings, "publishedPorts")).toBe(false);
    expect(isForkFeatureOn(settings, "parkedThreads")).toBe(true);
  });

  it("keeps a feature that hides an upstream control off until it is stored as true", () => {
    const hidesUsage = (features: Record<string, boolean>) =>
      isForkFeatureOn({ master: true, features }, "hideSidebarFooterUsage");
    expect(hidesUsage({})).toBe(false);
    expect(hidesUsage({ hideSidebarFooterUsage: true })).toBe(true);
    expect(hidesUsage({ sidebarFooterUsage: false })).toBe(true);
    expect(hidesUsage({ sidebarFooterUsage: false, hideSidebarFooterUsage: false })).toBe(false);
    expect(
      isForkFeatureOn(
        { master: false, features: { hideSidebarFooterUsage: true } },
        "hideSidebarFooterUsage",
      ),
    ).toBe(false);
  });

  it("restores the active settings when an override ends, and tells the listeners each time", () => {
    let changes = 0;
    using _listener = onForkFeatureSettingsChange(() => changes++);
    {
      using _settings = overrideForkFeatureSettings({ master: false });
      expect(forkFeatureActive("parkedThreads")).toBe(false);
    }
    expect(forkFeatureActive("parkedThreads")).toBe(true);
    expect(changes).toBe(2);
  });
});
