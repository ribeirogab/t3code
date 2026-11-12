import {
  isListedThreadLineage,
  type OrchestrationV2ThreadShell,
  type ThreadId,
} from "@t3tools/contracts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as Effect from "effect/Effect";

import type * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";

type TurnMessage = ProviderAdapter.ProviderAdapterV2TurnMessage;

type SiblingThread = Pick<OrchestrationV2ThreadShell, "id" | "title" | "lineage" | "deletedAt">;

const MAX_LISTED_SIBLINGS = 5;
const MAX_TITLE_LENGTH = 60;

export function isSiblingThread(thread: SiblingThread, threadId: ThreadId): boolean {
  return (
    thread.id !== threadId && thread.deletedAt === null && isListedThreadLineage(thread.lineage)
  );
}

const shortTitle = (title: string) =>
  title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1)}…` : title;

export function sharedWorktreeNote(siblings: ReadonlyArray<SiblingThread>): string | null {
  if (siblings.length === 0) return null;
  const listed = siblings
    .slice(0, MAX_LISTED_SIBLINGS)
    .map((thread) => `"${shortTitle(thread.title)}" (${thread.id})`);
  const more = siblings.length - listed.length;
  const names = more > 0 ? [...listed, `${more} more`] : listed;
  return `Other active threads use this worktree: ${names.join(", ")}. Stage only the paths you changed.`;
}

export function withSharedWorktreeNote<Input extends { readonly message: TurnMessage }>(
  input: Input,
  note: string | null,
): Input {
  const text = input.message.text;
  if (note === null || text.trim() === "" || text.trimStart().startsWith("/")) return input;
  return { ...input, message: { ...input.message, text: `${text}\n\n${note}` } };
}

export function makeSharedWorktreeTurnInput(
  projectionStore: ProjectionStore.ProjectionStoreV2["Service"],
) {
  const noteFor = Effect.fn("fork.sharedWorktree.noteFor")(function* (threadId: ThreadId) {
    const worktreePath = (yield* projectionStore.getThreadShell(threadId))?.worktreePath ?? null;
    if (worktreePath === null) return null;
    const snapshot = yield* projectionStore.getShellSnapshot({
      location: "active",
      unsettledOnly: true,
      worktreePath,
    });
    return sharedWorktreeNote(
      snapshot.threads.filter((thread) => isSiblingThread(thread, threadId)),
    );
  });
  return <Input extends { readonly threadId: ThreadId; readonly message: TurnMessage }>(
    input: Input,
  ) =>
    noteFor(input.threadId).pipe(
      Effect.orElseSucceed(() => null),
      Effect.map((note) => withSharedWorktreeNote(input, note)),
    );
}
