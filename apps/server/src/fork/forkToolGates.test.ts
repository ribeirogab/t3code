import { assert, describe, it } from "@effect/vitest";
import { overrideForkFeatureSettings } from "@t3tools/contracts";

import { forkToolVisible } from "./forkToolGates.ts";

describe("forkToolVisible", () => {
  it("lists each fork tool only while its feature is on", () => {
    for (const tool of ["publish_port", "unpublish_port"]) {
      assert.isTrue(forkToolVisible(tool));
      using _feature = overrideForkFeatureSettings({ features: { publishedPorts: false } });
      assert.isFalse(forkToolVisible(tool), tool);
    }
    using _master = overrideForkFeatureSettings({ master: false });
    assert.isTrue(forkToolVisible("delegate_task"));
    assert.isFalse(forkToolVisible("publish_port"));
  });
});
