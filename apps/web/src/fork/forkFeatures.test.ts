import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_FORK_FEATURES, FORK_FEATURES, mergePersistedForkFeatures } from "./forkFeatures";

describe("fork features", () => {
  it("turns every feature on by default", () => {
    expect(Object.values(DEFAULT_FORK_FEATURES)).toEqual(FORK_FEATURES.map(() => true));
  });

  it("falls back to the defaults for missing or malformed persisted state", () => {
    expect(mergePersistedForkFeatures(undefined)).toEqual(DEFAULT_FORK_FEATURES);
    expect(mergePersistedForkFeatures({ enabled: "all" })).toEqual(DEFAULT_FORK_FEATURES);
  });

  it("keeps stored booleans and fills unknown features from the defaults", () => {
    expect(
      mergePersistedForkFeatures({
        enabled: { forkPill: false, nestedThreads: "no", retired: false },
      }),
    ).toEqual({ ...DEFAULT_FORK_FEATURES, forkPill: false });
  });
});
