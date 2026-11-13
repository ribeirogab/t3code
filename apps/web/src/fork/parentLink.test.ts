import { describe, expect, it } from "vite-plus/test";
import { ThreadId } from "@t3tools/contracts";

import { isSubagentLineage, parentLinkTitle } from "./parentLink";

const parentThreadId = ThreadId.make("parent");

describe("isSubagentLineage", () => {
  it("accepts a subagent and a listed child that the server sends as a normal thread", () => {
    expect(isSubagentLineage({ parentThreadId, relationshipToParent: "subagent" }, true)).toBe(
      true,
    );
    expect(isSubagentLineage({ parentThreadId, relationshipToParent: null }, true)).toBe(true);
  });

  it("rejects a root thread, a detached thread, a fork, and a side chat", () => {
    expect(isSubagentLineage({ parentThreadId: null, relationshipToParent: null }, true)).toBe(
      false,
    );
    expect(isSubagentLineage({ parentThreadId, relationshipToParent: "fork" }, true)).toBe(false);
    expect(
      isSubagentLineage({ parentThreadId, relationshipToParent: null, sideChat: true }, true),
    ).toBe(false);
  });

  it("accepts only a subagent, as upstream does, while Nested threads is off", () => {
    expect(isSubagentLineage({ parentThreadId, relationshipToParent: "subagent" }, false)).toBe(
      true,
    );
    expect(isSubagentLineage({ parentThreadId, relationshipToParent: null }, false)).toBe(false);
  });
});

describe("parentLinkTitle", () => {
  it("links a parent only while it is loaded and not archived", () => {
    expect(parentLinkTitle({ title: "Parent", archivedAt: null }, true)).toBe("Parent");
    expect(
      parentLinkTitle({ title: "Parent", archivedAt: "2026-11-10T12:00:00.000Z" }, true),
    ).toBeNull();
    expect(parentLinkTitle(null, true)).toBeNull();
  });

  it("links every parent, as upstream does, while Nested threads is off", () => {
    expect(
      parentLinkTitle({ title: "Parent", archivedAt: "2026-11-10T12:00:00.000Z" }, false),
    ).toBe("Parent");
    expect(parentLinkTitle(null, false)).toBe("Parent thread");
  });
});
