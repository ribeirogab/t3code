import { describe, expect, it } from "vite-plus/test";
import { ThreadId } from "@t3tools/contracts";

import { activeParent, isSubagentLineage } from "./parentLink";

const parentThreadId = ThreadId.make("parent");

describe("isSubagentLineage", () => {
  it("accepts a subagent and a listed child that the server sends as a normal thread", () => {
    expect(isSubagentLineage({ parentThreadId, relationshipToParent: "subagent" })).toBe(true);
    expect(isSubagentLineage({ parentThreadId, relationshipToParent: null })).toBe(true);
  });

  it("rejects a root thread, a detached thread, a fork, and a side chat", () => {
    expect(isSubagentLineage({ parentThreadId: null, relationshipToParent: null })).toBe(false);
    expect(isSubagentLineage({ parentThreadId, relationshipToParent: "fork" })).toBe(false);
    expect(isSubagentLineage({ parentThreadId, relationshipToParent: null, sideChat: true })).toBe(
      false,
    );
  });
});

describe("activeParent", () => {
  it("keeps a parent only while it is loaded and not archived", () => {
    const active = { archivedAt: null };
    expect(activeParent(active)).toBe(active);
    expect(activeParent({ archivedAt: "2026-11-10T12:00:00.000Z" })).toBeNull();
    expect(activeParent(null)).toBeNull();
  });
});
