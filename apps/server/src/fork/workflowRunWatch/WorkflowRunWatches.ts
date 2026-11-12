import {
  CommandId,
  isProviderNativeSubagentThread,
  MessageId,
  type OrchestrationV2AppThread,
  type ThreadId,
} from "@t3tools/contracts";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import * as ServerConfig from "../../config.ts";
import * as Orchestrator from "../../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../../orchestration-v2/ProjectionStore.ts";
import { forkParked } from "../../serverActivation.ts";
import * as GitHubCli from "../gitHubCli.ts";
import {
  sameWatchTarget,
  unreadableWake,
  WORKFLOW_RUN_READ_FAILURE_LIMIT,
  type WorkflowRunWake,
  workflowRunWake,
  type WorkflowRunWatchRecord,
  WorkflowRunWatchesFile,
} from "./workflowRunRules.ts";

const WATCHES_FILE = "fork-workflow-run-watches.json";
const SWEEP_INTERVAL = "30 seconds";
const PARALLEL_READS = 4;

export interface WatchWorkflowRunInput {
  readonly threadId: ThreadId;
  readonly host: string;
  readonly repository: string;
  readonly branch: string;
  readonly workflow: string | null;
  readonly sha: string | null;
}

export interface StopWorkflowRunInput {
  readonly threadId: ThreadId;
  readonly branch: string;
  readonly workflow: string | null;
}

export interface WorkflowRunWatchStore {
  readonly load: Effect.Effect<ReadonlyArray<WorkflowRunWatchRecord>>;
  readonly save: (watches: ReadonlyArray<WorkflowRunWatchRecord>) => Effect.Effect<void>;
}

export interface WorkflowRunWatchesDependencies {
  readonly cli: GitHubCli.ForkGitHubCli["Service"];
  readonly store: WorkflowRunWatchStore;
  readonly threadWatchable: (threadId: ThreadId) => Effect.Effect<boolean>;
  readonly wake: (watch: WorkflowRunWatchRecord, wake: WorkflowRunWake) => Effect.Effect<boolean>;
  readonly newId: Effect.Effect<string>;
}

export class WorkflowRunWatches extends Context.Service<
  WorkflowRunWatches,
  {
    readonly watch: (
      input: WatchWorkflowRunInput,
    ) => Effect.Effect<WorkflowRunWatchRecord, GitHubCli.ForkGitHubCliError>;
    readonly stop: (input: StopWorkflowRunInput) => Effect.Effect<number>;
    readonly sweep: Effect.Effect<void>;
  }
>()("t3/fork/workflowRunWatch/WorkflowRunWatches") {}

const stopsWatch = (input: StopWorkflowRunInput) => (watch: WorkflowRunWatchRecord) =>
  watch.threadId === input.threadId &&
  watch.branch === input.branch &&
  (input.workflow === null || watch.workflow === input.workflow);

export const make = Effect.fn("WorkflowRunWatches.make")(function* (
  deps: WorkflowRunWatchesDependencies,
) {
  const watches = yield* Ref.make(yield* deps.store.load);
  const readFailures = new Map<string, number>();
  const writes = Semaphore.makeUnsafe(1);

  const update = (
    change: (
      current: ReadonlyArray<WorkflowRunWatchRecord>,
    ) => ReadonlyArray<WorkflowRunWatchRecord>,
  ) => writes.withPermit(Ref.updateAndGet(watches, change).pipe(Effect.flatMap(deps.store.save)));

  const watch = Effect.fn("WorkflowRunWatches.watch")(function* (input: WatchWorkflowRunInput) {
    const sha = input.sha ?? (yield* deps.cli.branchHead(input));
    yield* deps.cli.workflowRuns({ ...input, sha });
    const record: WorkflowRunWatchRecord = {
      id: yield* deps.newId,
      threadId: input.threadId,
      host: input.host,
      repository: input.repository,
      branch: input.branch,
      sha,
      workflow: input.workflow,
      startedAt: yield* Clock.currentTimeMillis,
    };
    yield* update((current) => [
      ...current.filter((known) => !sameWatchTarget(known, record)),
      record,
    ]);
    return record;
  });

  const stop = Effect.fn("WorkflowRunWatches.stop")(function* (input: StopWorkflowRunInput) {
    const before = (yield* Ref.get(watches)).filter(stopsWatch(input)).length;
    yield* update((current) => current.filter((known) => !stopsWatch(input)(known)));
    return before;
  });

  const failedAgain = (record: WorkflowRunWatchRecord) => {
    const failures = (readFailures.get(record.id) ?? 0) + 1;
    readFailures.set(record.id, failures);
    return failures >= WORKFLOW_RUN_READ_FAILURE_LIMIT;
  };

  const verdictOf = Effect.fn("WorkflowRunWatches.verdictOf")(function* (
    record: WorkflowRunWatchRecord,
    now: number,
  ) {
    if (!(yield* deps.threadWatchable(record.threadId))) return "dropped" as const;
    const read = yield* Effect.result(deps.cli.workflowRuns(record));
    if (Result.isFailure(read)) {
      return failedAgain(record) ? unreadableWake(record, read.failure.detail) : null;
    }
    readFailures.delete(record.id);
    return workflowRunWake(record, read.success, now);
  });

  const sweep = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const ended = new Set<string>();
    yield* Effect.forEach(
      yield* Ref.get(watches),
      (record) =>
        verdictOf(record, now).pipe(
          Effect.flatMap((verdict) =>
            verdict === null
              ? Effect.succeed(false)
              : verdict === "dropped"
                ? Effect.succeed(true)
                : deps
                    .wake(record, verdict)
                    .pipe(Effect.map((delivered) => delivered || failedAgain(record))),
          ),
          Effect.tap((done) =>
            Effect.sync(() => {
              if (!done) return;
              ended.add(record.id);
              readFailures.delete(record.id);
            }),
          ),
          Effect.catchCause((cause) =>
            Effect.logWarning("workflow run watch check failed", { watchId: record.id, cause }),
          ),
        ),
      { concurrency: PARALLEL_READS, discard: true },
    );
    if (ended.size > 0) yield* update((current) => current.filter((known) => !ended.has(known.id)));
  }).pipe(Effect.withSpan("WorkflowRunWatches.sweep"));

  return WorkflowRunWatches.of({ watch, stop, sweep });
});

const decodeStoreFile = Schema.decodeUnknownEffect(Schema.fromJsonString(WorkflowRunWatchesFile));

const makeFileStore = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
  const filePath = path.join(config.stateDir, WATCHES_FILE);
  return {
    load: fs.readFileString(filePath).pipe(
      Effect.flatMap(decodeStoreFile),
      Effect.map((file) => file.watches),
      Effect.orElseSucceed(() => []),
    ),
    save: (watches) =>
      writeFileStringAtomically({
        filePath,
        contents: `${JSON.stringify({ watches }, null, 2)}\n`,
      }).pipe(
        Effect.provide(services),
        Effect.catchCause((cause) =>
          Effect.logWarning("the workflow run watches file could not be written", { cause }),
        ),
      ),
  } satisfies WorkflowRunWatchStore;
});

const threadWatchable = (
  thread: Pick<
    OrchestrationV2AppThread,
    "archivedAt" | "deletedAt" | "settledOverride" | "lineage" | "creationSource"
  >,
) =>
  thread.archivedAt === null &&
  thread.deletedAt == null &&
  thread.settledOverride !== "settled" &&
  !isProviderNativeSubagentThread(thread);

export const layer = Layer.effect(
  WorkflowRunWatches,
  Effect.gen(function* () {
    const engine = yield* Orchestrator.OrchestratorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const random = yield* SecureRandom.SecureRandom;
    const service = yield* make({
      cli: yield* GitHubCli.ForkGitHubCli,
      store: yield* makeFileStore,
      threadWatchable: (threadId) =>
        projections.getThread(threadId).pipe(
          Effect.map(threadWatchable),
          Effect.orElseSucceed(() => false),
        ),
      wake: (record, wake) =>
        engine
          .dispatch({
            type: "message.dispatch",
            commandId: CommandId.make(`server:fork-workflow-run:${record.id}`),
            threadId: record.threadId,
            messageId: MessageId.make(`message:fork-workflow-run:${record.id}`),
            text: wake.text,
            notification: wake.notification,
            attachments: [],
            dispatchMode: { type: "queue_after_active" },
            createdBy: "agent",
            creationSource: "server",
          })
          .pipe(
            Effect.as(true),
            Effect.catchCause((cause) =>
              Effect.logWarning("workflow run watch wake failed", {
                watchId: record.id,
                cause,
              }).pipe(Effect.as(false)),
            ),
          ),
      newId: random.uuidV4(),
    });
    yield* forkParked(
      service.sweep.pipe(Effect.repeat(Schedule.spaced(SWEEP_INTERVAL)), Effect.asVoid),
    );
    return service;
  }),
).pipe(Layer.provide(ProjectionStore.layer), Layer.provide(GitHubCli.layer));
