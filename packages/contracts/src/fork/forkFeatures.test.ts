import { describe, expect, it } from "vite-plus/test";

import { ThreadId } from "../baseSchemas.ts";
import { isListedThreadLineage } from "../orchestrationV2.ts";
import {
  DEFAULT_FORK_FEATURE_SETTINGS,
  forkFeatureActive,
  isForkFeatureOn,
  onForkFeatureSettingsChange,
  overrideForkFeatureSettings,
} from "./forkFeatures.ts";

describe("isForkFeatureOn", () => {
  it("turns every feature on by default and off with the master switch", () => {
    expect(isForkFeatureOn(DEFAULT_FORK_FEATURE_SETTINGS, "nestedThreads")).toBe(true);
    expect(isForkFeatureOn({ master: false, features: {} }, "nestedThreads")).toBe(false);
    expect(
      isForkFeatureOn({ master: false, features: { nestedThreads: true } }, "nestedThreads"),
    ).toBe(false);
  });

  it("turns off only the feature stored as false", () => {
    const settings = { master: true, features: { forkPill: false, retired: false } };
    expect(isForkFeatureOn(settings, "forkPill")).toBe(false);
    expect(isForkFeatureOn(settings, "nestedThreads")).toBe(true);
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
      expect(forkFeatureActive("nestedThreads")).toBe(false);
    }
    expect(forkFeatureActive("nestedThreads")).toBe(true);
    expect(changes).toBe(2);
  });
});

describe("isListedThreadLineage", () => {
  const parent = ThreadId.make("thread:parent");
  const listedSubagent = {
    parentThreadId: parent,
    relationshipToParent: "subagent" as const,
    rootThreadId: parent,
    listed: true,
  };
  const hiddenFork = {
    parentThreadId: parent,
    relationshipToParent: "fork" as const,
    rootThreadId: parent,
    listed: false,
  };

  it("follows the listed flag while Nested threads is on", () => {
    expect(isListedThreadLineage(listedSubagent)).toBe(true);
    expect(isListedThreadLineage(hiddenFork)).toBe(false);
  });

  it("ignores the listed flag, as upstream does, while Nested threads is off", () => {
    using _settings = overrideForkFeatureSettings({ features: { nestedThreads: false } });
    expect(isListedThreadLineage(listedSubagent)).toBe(false);
    expect(isListedThreadLineage(hiddenFork)).toBe(true);
  });
});
