import { assert, describe, it } from "@effect/vitest";
import {
  EventId,
  MessageId,
  overrideForkFeatureSettings,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import {
  isSiblingThread,
  makeSharedWorktreeTurnInput,
  sharedWorktreeNote,
  withSharedWorktreeNote,
} from "./sharedWorktree.ts";

const self = ThreadId.make("thread:self");

const sibling = (
  id: string,
  title: string,
  lineage: Partial<OrchestrationV2ThreadShell["lineage"]> = {},
) => ({
  id: ThreadId.make(id),
  title,
  deletedAt: null,
  lineage: {
    parentThreadId: null,
    relationshipToParent: null,
    rootThreadId: ThreadId.make(id),
    ...lineage,
  },
});

const turn = (text: string) => ({
  threadId: self,
  message: {
    messageId: MessageId.make("message:1"),
    text,
    attachments: [],
    createdBy: "user" as const,
    creationSource: "web" as const,
  },
});

describe("sharedWorktreeNote", () => {
  it("lists the other threads and asks to stage only changed paths", () => {
    assert.strictEqual(
      sharedWorktreeNote([sibling("thread:a", "Fix login"), sibling("thread:b", "Docs")]),
      'Other active threads use this worktree: "Fix login" (thread:a), "Docs" (thread:b). Stage only the paths you changed.',
    );
  });

  it("has no note without other threads", () => {
    assert.isNull(sharedWorktreeNote([]));
  });

  it("lists five threads, counts the rest and cuts long titles", () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      sibling(`thread:${index}`, "x".repeat(80)),
    );
    const note = sharedWorktreeNote(many) ?? "";
    assert.include(note, `"${"x".repeat(59)}…" (thread:4), 2 more.`);
    assert.notInclude(note, "thread:5");
  });

  it("counts only other listed threads", () => {
    assert.isTrue(isSiblingThread(sibling("thread:a", "A"), self));
    assert.isFalse(isSiblingThread(sibling("thread:self", "Self"), self));
    assert.isFalse(
      isSiblingThread(sibling("thread:sub", "Sub", { relationshipToParent: "subagent" }), self),
    );
    assert.isFalse(isSiblingThread(sibling("thread:side", "Side", { sideChat: true }), self));
    assert.isTrue(
      isSiblingThread(
        sibling("thread:listed", "Listed", { relationshipToParent: "subagent", listed: true }),
        self,
      ),
    );
  });
});

describe("withSharedWorktreeNote", () => {
  it("adds the note after the message text", () => {
    assert.strictEqual(
      withSharedWorktreeNote(turn("Commit it"), "Note.").message.text,
      "Commit it\n\nNote.",
    );
  });

  it("leaves slash commands, empty messages and threads without a note alone", () => {
    const command = turn("/goal clear");
    assert.strictEqual(withSharedWorktreeNote(command, "Note."), command);
    const empty = turn("  ");
    assert.strictEqual(withSharedWorktreeNote(empty, "Note."), empty);
    const plain = turn("Commit it");
    assert.strictEqual(withSharedWorktreeNote(plain, null), plain);
  });
});

const layerTest = Layer.mergeAll(
  ProjectionStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory)),
  SqlitePersistence.layerMemory,
);

const createThread = (input: {
  readonly id: ThreadId;
  readonly title: string;
  readonly worktreePath: string | null;
  readonly archived?: boolean;
  readonly settled?: boolean;
}) =>
  Effect.gen(function* () {
    const store = yield* ProjectionStore.ProjectionStoreV2;
    const now = yield* DateTime.now;
    yield* store.apply({
      id: EventId.make(`event:${input.id}:created`),
      type: "thread.created",
      threadId: input.id,
      occurredAt: now,
      payload: {
        createdBy: "user",
        creationSource: "web",
        id: input.id,
        projectId: ProjectId.make("project:shared"),
        title: input.title,
        providerInstanceId: ProviderInstanceId.make("claude"),
        modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "haiku" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: "work",
        worktreePath: input.worktreePath,
        activeProviderThreadId: null,
        lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: input.id },
        forkedFrom: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: input.archived === true ? now : null,
        settledOverride: null,
        settledAt: input.settled === true ? now : null,
        lastVisitedAt: null,
        deletedAt: null,
      },
    });
  });

it.layer(layerTest)("shared worktree turn note", (it) => {
  it.effect("lists only the active, unsettled threads in the same worktree", () =>
    Effect.gen(function* () {
      const store = yield* ProjectionStore.ProjectionStoreV2;
      const worktreePath = "/work/shared";
      yield* createThread({ id: self, title: "Self", worktreePath });
      yield* createThread({ id: ThreadId.make("thread:open"), title: "Open", worktreePath });
      yield* createThread({
        id: ThreadId.make("thread:archived"),
        title: "Archived",
        worktreePath,
        archived: true,
      });
      yield* createThread({
        id: ThreadId.make("thread:settled"),
        title: "Settled",
        worktreePath,
        settled: true,
      });
      yield* createThread({
        id: ThreadId.make("thread:elsewhere"),
        title: "Elsewhere",
        worktreePath: "/work/other",
      });

      const withNote = makeSharedWorktreeTurnInput(store);
      assert.strictEqual(
        (yield* withNote(turn("Commit it"))).message.text,
        'Commit it\n\nOther active threads use this worktree: "Open" (thread:open). Stage only the paths you changed.',
      );
      const alone = { ...turn("Commit it"), threadId: ThreadId.make("thread:elsewhere") };
      assert.strictEqual((yield* withNote(alone)).message.text, "Commit it");

      using _settings = overrideForkFeatureSettings({ features: { sharedWorktree: false } });
      const shared = turn("Commit it");
      assert.strictEqual(yield* withNote(shared), shared);
    }),
  );
});
