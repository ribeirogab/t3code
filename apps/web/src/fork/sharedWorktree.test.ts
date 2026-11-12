import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { sharedWorktreeLabel, threadsSharingWorktree } from "./sharedWorktree";

const environmentId = EnvironmentId.make("environment-1");

const thread = (
  id: string,
  overrides: Partial<Parameters<typeof threadsSharingWorktree>[0]> = {},
) => ({
  environmentId,
  id: ThreadId.make(id),
  title: id,
  worktreePath: "/work/shared",
  archivedAt: null,
  deletedAt: null,
  settledAt: null,
  settledOverride: null,
  lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: ThreadId.make(id) },
  ...overrides,
});

describe("threadsSharingWorktree", () => {
  it("finds the other active threads in the same worktree on the same machine", () => {
    const self = thread("self");
    const sharing = threadsSharingWorktree(self, [
      self,
      thread("open"),
      thread("other-worktree", { worktreePath: "/work/other" }),
      thread("other-machine", { environmentId: EnvironmentId.make("environment-2") }),
      thread("archived", { archivedAt: "2026-11-11T10:00:00.000Z" }),
      thread("settled", { settledAt: "2026-11-11T10:00:00.000Z" }),
      thread("settled-override", { settledOverride: "settled" }),
      thread("side-chat", {
        lineage: {
          parentThreadId: ThreadId.make("self"),
          relationshipToParent: null,
          rootThreadId: ThreadId.make("self"),
          sideChat: true,
        },
      }),
      thread("subagent", {
        lineage: {
          parentThreadId: ThreadId.make("self"),
          relationshipToParent: "subagent",
          rootThreadId: ThreadId.make("self"),
        },
      }),
    ]);
    expect(sharing.map((entry) => entry.id)).toEqual(["open"]);
  });

  it("finds nothing for a thread outside a worktree", () => {
    expect(
      threadsSharingWorktree(thread("self", { worktreePath: null }), [thread("open")]),
    ).toEqual([]);
  });

  it("names one thread or several", () => {
    expect(sharedWorktreeLabel(1)).toBe("Shared with 1 thread");
    expect(sharedWorktreeLabel(3)).toBe("Shared with 3 threads");
  });
});
