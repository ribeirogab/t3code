import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_FORK_FEATURES,
  FORK_FEATURES,
  isForkFeatureActive,
  mergePersistedForkSettings,
} from "./forkFeatures";

describe("fork features", () => {
  it("turns every feature and the master switch on by default", () => {
    expect(Object.values(DEFAULT_FORK_FEATURES)).toEqual(FORK_FEATURES.map(() => true));
    expect(mergePersistedForkSettings(undefined)).toEqual({
      master: true,
      enabled: DEFAULT_FORK_FEATURES,
    });
  });

  it("falls back to the defaults for malformed persisted state", () => {
    expect(mergePersistedForkSettings({ master: "off", enabled: "all" })).toEqual({
      master: true,
      enabled: DEFAULT_FORK_FEATURES,
    });
  });

  it("keeps stored booleans and fills unknown features from the defaults", () => {
    expect(
      mergePersistedForkSettings({
        master: false,
        enabled: { forkPill: false, nestedThreads: "no", retired: false },
      }),
    ).toEqual({ master: false, enabled: { ...DEFAULT_FORK_FEATURES, forkPill: false } });
  });

  it("turns every feature off while the master switch is off and keeps the choices", () => {
    const enabled = { ...DEFAULT_FORK_FEATURES, forkPill: false };
    const active = (master: boolean) =>
      FORK_FEATURES.map(({ key }) => isForkFeatureActive({ master, enabled }, key));
    expect(active(false)).toEqual(FORK_FEATURES.map(() => false));
    expect(active(true)).toEqual(FORK_FEATURES.map(({ key }) => key !== "forkPill"));
  });
});
