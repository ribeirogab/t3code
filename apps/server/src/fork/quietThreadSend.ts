import {
  ForkHeldThreadNote,
  forkFeatureActive,
  MessageId,
  OrchestratorMcpFailure,
  ThreadId,
} from "@t3tools/contracts";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

import * as ServerConfig from "../config.ts";
import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import { ThreadManagementNoSteerableRunError } from "../orchestration-v2/ThreadManagementService.ts";

const NOTES_FILE = "fork-held-thread-notes.json";

const HeldNotesFile = Schema.Struct({ notes: Schema.Array(ForkHeldThreadNote) });

let heldNotes: ReadonlyArray<ForkHeldThreadNote> = [];
let saveNotes: (notes: ReadonlyArray<ForkHeldThreadNote>) => Effect.Effect<void> = () =>
  Effect.void;
let newNoteId: Effect.Effect<string> = Effect.die("the held thread notes store is not loaded");

const replaceNotes = (next: ReadonlyArray<ForkHeldThreadNote>) =>
  Effect.suspend(() => {
    heldNotes = next;
    return saveNotes(next);
  });

export function heldNotesFor(
  threadId: ThreadId,
  message: { readonly createdBy: string; readonly creationSource: string },
  promptless: boolean,
): ReadonlyArray<ForkHeldThreadNote> {
  const drainsProviderOutput =
    message.createdBy === "agent" && message.creationSource === "provider";
  if (promptless || drainsProviderOutput) return [];
  return heldNotes.filter((note) => note.threadId === threadId);
}

export const releaseHeldNotes = (released: ReadonlyArray<ForkHeldThreadNote>) =>
  Effect.suspend(() => {
    if (released.length === 0) return Effect.void;
    const ids = new Set(released.map((note) => note.id));
    return replaceNotes(heldNotes.filter((note) => !ids.has(note.id)));
  });

export function heldNotesContext(notes: ReadonlyArray<ForkHeldThreadNote>): string {
  if (notes.length === 0) return "";
  return [
    "Messages sent to this thread while it was idle, without starting a turn:",
    ...notes.map(
      (note) =>
        `- ${note.senderThreadId === null ? "From an agent" : `From thread ${note.senderThreadId}`} at ${note.heldAt}: ${note.text}`,
    ),
  ].join("\n");
}

const noRunningTurn = (threadId: ThreadId) =>
  new ThreadManagementNoSteerableRunError({ threadId, mode: "steer" }).message;

const holdNote = Effect.fn("ForkQuietThreadSend.holdNote")(function* (
  threadId: ThreadId,
  text: string,
) {
  const scope = yield* McpInvocationContext.McpInvocationContext;
  const now = yield* DateTime.now;
  const note: ForkHeldThreadNote = {
    id: MessageId.make(`message:fork-held:${yield* newNoteId}`),
    threadId,
    senderThreadId: scope.thread?.threadId ?? null,
    text,
    heldAt: DateTime.formatIso(now),
  };
  yield* replaceNotes([...heldNotes, note]);
  return { threadId, messageId: note.id, delivery: "held" as const };
});

type SendHandler = (params: object) => Effect.Effect<unknown, OrchestratorMcpFailure>;

const quietSend = Effect.fn("ForkQuietThreadSend.send")(function* (
  params: object,
  send: SendHandler,
) {
  if (!("wake" in params)) return yield* send(params);
  const { wake, ...rest } = params;
  if (wake !== false || !forkFeatureActive("quietThreadSend")) return yield* send(rest);
  const { freshContext: _freshContext, ...steered } = rest as Record<string, unknown>;
  const threadId = steered.threadId;
  const text = steered.message;
  if (!Predicate.isString(threadId) || !Predicate.isString(text)) return yield* send(rest);
  return yield* send({ ...steered, mode: "steer" }).pipe(
    Effect.catchIf(
      (failure) =>
        failure.code === "thread_not_sendable" &&
        failure.message === noRunningTurn(ThreadId.make(threadId)),
      () => holdNote(ThreadId.make(threadId), text),
    ),
  );
});

export function withQuietSend<Handlers extends object>(handlers: Handlers): Handlers {
  const send = (handlers as Record<string, unknown>).t3_thread_send;
  if (!Predicate.isFunction(send)) return handlers;
  const quiet = (params: object) => quietSend(params, send as SendHandler);
  return { ...handlers, t3_thread_send: quiet };
}

const decodeNotesFile = Schema.decodeUnknownEffect(Schema.fromJsonString(HeldNotesFile));

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
    const random = yield* SecureRandom.SecureRandom;
    newNoteId = random.uuidV4();
    const filePath = path.join(config.stateDir, NOTES_FILE);
    heldNotes = yield* fs.readFileString(filePath).pipe(
      Effect.flatMap(decodeNotesFile),
      Effect.map((file) => file.notes),
      Effect.orElseSucceed(() => []),
    );
    saveNotes = (notes) =>
      writeFileStringAtomically({
        filePath,
        contents: `${JSON.stringify({ notes }, null, 2)}\n`,
      }).pipe(
        Effect.provide(services),
        Effect.catchCause((cause) =>
          Effect.logWarning("the held thread notes file could not be written", { cause }),
        ),
      );
  }),
);
