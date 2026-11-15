import { forkFeatureActive, type CommandId, type ThreadId } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import type { ThreadManagementServiceShape } from "../orchestration-v2/ThreadManagementService.ts";

const ARCHIVE_WAIT = Duration.hours(24);

export const ArchivesWhenTurnEnds = Schema.Struct({
  archivesWhenTurnEnds: Schema.Literal(true),
});

type ArchiveThreads = Pick<
  ThreadManagementServiceShape,
  "getThreadShell" | "getThreadEventSequence" | "streamStoredEventsFrom" | "dispatch"
>;

interface ArchiveRequest {
  readonly threadId: ThreadId;
  readonly commandId: CommandId;
}

const archiveOnceIdle = Effect.fn("fork.archiveAfterTurn.archiveOnceIdle")(function* (
  threads: ArchiveThreads,
  request: ArchiveRequest,
) {
  const afterSequence = yield* threads.getThreadEventSequence(request.threadId);
  const tryArchive = Effect.gen(function* () {
    const shell = yield* threads.getThreadShell(request.threadId);
    if (shell === null || shell.deletedAt !== null || shell.archivedAt !== null) return true;
    if (shell.activeRunId !== null) return false;
    yield* threads.dispatch({ type: "thread.archive", ...request });
    return true;
  });
  yield* Stream.fromEffect(tryArchive).pipe(
    Stream.concat(
      threads
        .streamStoredEventsFrom({
          threadId: request.threadId,
          afterSequence,
          eventType: "run.updated",
        })
        .pipe(Stream.mapEffect(() => tryArchive)),
    ),
    Stream.filter((archived) => archived),
    Stream.runHead,
    Effect.timeoutOption(ARCHIVE_WAIT),
  );
});

export const archiveAfterTurn = Effect.fn("fork.archiveAfterTurn")(function* (
  threads: ArchiveThreads,
  action: string,
  request: ArchiveRequest,
) {
  if (action !== "archive" || !forkFeatureActive("archiveAfterTurn")) return null;
  const shell = yield* threads.getThreadShell(request.threadId);
  if (shell === null || shell.activeRunId === null) return null;
  yield* archiveOnceIdle(threads, request).pipe(
    Effect.ignoreCause({ log: true }),
    Effect.forkDetach,
  );
  return { archivesWhenTurnEnds: true } as const;
});
