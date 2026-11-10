import { describe, expect, it } from "vite-plus/test";
import {
  ThreadId,
  type OrchestrationV2AppThreadLineage,
  type OrchestrationV2ThreadStreamItem,
} from "@t3tools/contracts";

import { wireLineage, wireThreadLists, wireThreadStreamItem } from "./wireLineage.ts";

const parent = ThreadId.make("parent");

function lineage(
  overrides: Partial<OrchestrationV2AppThreadLineage>,
): OrchestrationV2AppThreadLineage {
  return {
    parentThreadId: parent,
    relationshipToParent: "subagent",
    rootThreadId: parent,
    ...overrides,
  };
}

describe("wireLineage", () => {
  it("sends a listed subagent as a normal thread that keeps its parent", () => {
    expect(wireLineage(lineage({ listed: true }))).toEqual(
      lineage({ listed: true, relationshipToParent: null }),
    );
  });

  it("sends a detached thread without a parent", () => {
    for (const relationshipToParent of ["subagent", "fork"] as const) {
      expect(wireLineage(lineage({ relationshipToParent, listed: true, detached: true }))).toEqual(
        lineage({
          listed: true,
          detached: true,
          parentThreadId: null,
          relationshipToParent: null,
        }),
      );
    }
  });

  it("leaves every other lineage as stored", () => {
    for (const stored of [
      lineage({}),
      lineage({ listed: false }),
      lineage({ relationshipToParent: "fork" }),
      lineage({ relationshipToParent: "fork", listed: true }),
      lineage({ parentThreadId: null, relationshipToParent: null }),
    ]) {
      expect(wireLineage(stored)).toBe(stored);
    }
  });

  it("is stable when applied to its own output", () => {
    const wired = wireLineage(lineage({ listed: true, detached: true }));
    expect(wireLineage(wired)).toBe(wired);
  });
});

describe("wireThreadLists", () => {
  it("rewrites active and archived threads and keeps unchanged lists by reference", () => {
    const hidden = { id: "hidden", lineage: lineage({}) };
    const listed = { id: "listed", lineage: lineage({ listed: true }) };
    const unchanged = { threads: [hidden], archivedThreads: [hidden] };
    expect(wireThreadLists(unchanged)).toBe(unchanged);
    const wired = wireThreadLists({ threads: [hidden, listed], archivedThreads: [listed] });
    expect(wired.threads[0]).toBe(hidden);
    expect(wired.threads[1]?.lineage.relationshipToParent).toBeNull();
    expect(wired.archivedThreads[0]?.lineage.relationshipToParent).toBeNull();
  });
});

describe("wireThreadStreamItem", () => {
  it("rewrites the thread payload of an event and keeps other items by reference", () => {
    const threadEvent = {
      kind: "event",
      sequence: 1,
      event: { type: "thread.metadata-updated", payload: { lineage: lineage({ listed: true }) } },
    } as unknown as OrchestrationV2ThreadStreamItem;
    const wired = wireThreadStreamItem(threadEvent);
    expect(wired).toMatchObject({
      event: { payload: { lineage: { relationshipToParent: null, parentThreadId: parent } } },
    });
    const runEvent = {
      kind: "event",
      sequence: 2,
      event: { type: "run.updated", payload: { id: "run" } },
    } as unknown as OrchestrationV2ThreadStreamItem;
    expect(wireThreadStreamItem(runEvent)).toBe(runEvent);
    const synchronized: OrchestrationV2ThreadStreamItem = { kind: "synchronized" };
    expect(wireThreadStreamItem(synchronized)).toBe(synchronized);
  });
});
