import { overrideForkFeatureSettings, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { isParkedThread } from "./parkedThreads.ts";

const parked = ThreadId.make("thread-parked");
const other = ThreadId.make("thread-other");
const settings = { parkedThreadIds: [parked] };

describe("isParkedThread", () => {
  it("holds only the parked ids while the feature is on", () => {
    expect(isParkedThread(settings, parked)).toBe(true);
    expect(isParkedThread(settings, other)).toBe(false);
  });

  it("parks nothing when the feature or the master switch is off", () => {
    {
      using _off = overrideForkFeatureSettings({ features: { parkedThreads: false } });
      expect(isParkedThread(settings, parked)).toBe(false);
    }
    using _master = overrideForkFeatureSettings({ master: false });
    expect(isParkedThread(settings, parked)).toBe(false);
  });
});
