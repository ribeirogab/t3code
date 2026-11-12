import {
  ForkPublishedPortError,
  type ForkPublishedPort,
  type ForkPublishedPorts,
  type OrchestrationV2DomainEvent,
  type ThreadId,
} from "@t3tools/contracts";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import * as ServerConfig from "../../config.ts";
import * as Orchestrator from "../../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../../orchestration-v2/ProjectionStore.ts";
import { forkParked } from "../../serverActivation.ts";
import {
  type HostRewriteProxy,
  type StartHostRewriteProxy,
  startHostRewriteProxy,
} from "./hostRewriteProxy.ts";
import {
  failedCheckDetail,
  normalizePublishedPath,
  PORT_RELEASE_EVENTS,
  type PublishedPortRecord,
  PublishedPortsFileSchema,
  publishedPortUrl,
  reconcilePublishedPorts,
  servesRecord,
  threadReleasesPorts,
} from "./publishedPortRules.ts";
import { makeTailnetServe, type TailnetServe } from "./tailnetCli.ts";

const PUBLISHED_PORTS_FILE = "fork-published-ports.json";

export interface PublishPortInput {
  readonly threadId: ThreadId;
  readonly port: number;
  readonly hostRewrite: boolean;
  readonly path?: string | undefined;
}

export interface PublishedPortsStore {
  readonly load: Effect.Effect<ReadonlyArray<PublishedPortRecord>>;
  readonly save: (records: ReadonlyArray<PublishedPortRecord>) => Effect.Effect<void>;
}

export interface PublishedPortsDependencies {
  readonly tailnet: TailnetServe;
  readonly startProxy: StartHostRewriteProxy;
  readonly store: PublishedPortsStore;
  readonly threadReleased: (threadId: ThreadId) => Effect.Effect<boolean>;
}

interface Entry {
  readonly record: PublishedPortRecord;
  readonly proxy: HostRewriteProxy | null;
}

export class PublishedPorts extends Context.Service<
  PublishedPorts,
  {
    readonly publish: (
      input: PublishPortInput,
    ) => Effect.Effect<ForkPublishedPort, ForkPublishedPortError>;
    readonly unpublish: (port: number) => Effect.Effect<void, ForkPublishedPortError>;
    readonly releaseThread: (threadId: ThreadId) => Effect.Effect<void>;
    readonly handle: (
      event: Pick<OrchestrationV2DomainEvent, "type" | "threadId">,
    ) => Effect.Effect<void>;
    readonly reconcile: Effect.Effect<void>;
    readonly threadPorts: (threadId: ThreadId) => Stream.Stream<ForkPublishedPorts>;
    readonly list: Effect.Effect<ReadonlyArray<ForkPublishedPort>>;
    readonly closeProxies: Effect.Effect<void>;
  }
>()("t3/fork/publishedPorts/PublishedPorts") {}

const toWire = ({ record }: Entry): ForkPublishedPort => ({
  port: record.port,
  threadId: record.threadId,
  url: record.url,
  hostRewrite: record.hostRewrite,
});

const samePorts = (left: ForkPublishedPorts, right: ForkPublishedPorts) =>
  left.ports.length === right.ports.length &&
  left.ports.every((port, index) => {
    const other = right.ports[index];
    return (
      other !== undefined &&
      port.port === other.port &&
      port.url === other.url &&
      port.hostRewrite === other.hostRewrite
    );
  });

const fail = (port: number, detail: string) => new ForkPublishedPortError({ port, detail });

const closeProxyOf = (entry: Entry) => entry.proxy?.close ?? Effect.void;

export const make = Effect.fn("PublishedPorts.make")(function* (deps: PublishedPortsDependencies) {
  const state = yield* SubscriptionRef.make<ReadonlyMap<number, Entry>>(new Map());
  const lock = yield* Semaphore.make(1);
  const locked = lock.withPermits(1);

  const save = SubscriptionRef.get(state).pipe(
    Effect.flatMap((entries) =>
      deps.store.save([...entries.values()].map((entry) => entry.record)),
    ),
  );

  const remember = (entry: Entry) =>
    SubscriptionRef.update(state, (entries) => new Map(entries).set(entry.record.port, entry)).pipe(
      Effect.andThen(save),
    );

  const forget = (port: number) =>
    SubscriptionRef.update(state, (entries) => {
      const next = new Map(entries);
      next.delete(port);
      return next;
    }).pipe(Effect.andThen(save));

  const release = Effect.fn("PublishedPorts.release")(function* (entry: Entry) {
    const served = yield* deps.tailnet.servedProxies;
    if (servesRecord(served, entry.record)) yield* deps.tailnet.off(entry.record.port);
    yield* closeProxyOf(entry);
    yield* forget(entry.record.port);
  });

  const checkOrTurnOff = Effect.fn("PublishedPorts.checkOrTurnOff")(function* (entry: Entry) {
    const { record } = entry;
    const turnOff = deps.tailnet
      .off(record.port)
      .pipe(Effect.ignore, Effect.andThen(closeProxyOf(entry)));
    const result = yield* deps.tailnet.check(record.url).pipe(Effect.tapError(() => turnOff));
    if (result.status >= 200 && result.status < 300) return;
    yield* turnOff;
    return yield* fail(
      record.port,
      failedCheckDetail({ url: record.url, ...result, hostRewrite: record.hostRewrite }),
    );
  });

  const publishUnlocked = Effect.fn("PublishedPorts.publish")(function* (input: PublishPortInput) {
    const existing = (yield* SubscriptionRef.get(state)).get(input.port);
    if (existing !== undefined && existing.record.threadId !== input.threadId) {
      return yield* fail(
        input.port,
        `Port ${input.port} is published by thread ${existing.record.threadId}. Unpublish it there first.`,
      );
    }
    const dnsName = yield* deps.tailnet.dnsName;
    if (existing !== undefined) yield* release(existing);
    const served = yield* deps.tailnet.servedProxies;
    if (served.has(input.port)) {
      return yield* fail(
        input.port,
        `tailscale serve already serves port ${input.port} outside T3. T3 leaves that config as it is.`,
      );
    }
    const proxy = input.hostRewrite ? yield* deps.startProxy({ upstreamPort: input.port }) : null;
    const entry: Entry = {
      proxy,
      record: {
        port: input.port,
        threadId: input.threadId,
        target: proxy?.port ?? input.port,
        hostRewrite: input.hostRewrite,
        url: publishedPortUrl({
          dnsName,
          port: input.port,
          path: normalizePublishedPath(input.path),
        }),
      },
    };
    yield* deps.tailnet
      .serve(entry.record.port, entry.record.target)
      .pipe(Effect.tapError(() => closeProxyOf(entry)));
    yield* checkOrTurnOff(entry);
    yield* remember(entry);
    return toWire(entry);
  });

  const unpublish = (port: number) =>
    locked(
      Effect.gen(function* () {
        const entry = (yield* SubscriptionRef.get(state)).get(port);
        if (entry === undefined) {
          return yield* fail(
            port,
            `Port ${port} is not published by T3. T3 turns off only the ports it published.`,
          );
        }
        yield* release(entry);
      }),
    );

  const releaseThreadUnlocked = Effect.fn("PublishedPorts.releaseThread")(function* (
    threadId: ThreadId,
  ) {
    const entries = [...(yield* SubscriptionRef.get(state)).values()].filter(
      (entry) => entry.record.threadId === threadId,
    );
    for (const entry of entries) {
      yield* release(entry).pipe(
        Effect.catch((error) =>
          Effect.logWarning("a published port of a released thread stayed open", {
            threadId,
            port: entry.record.port,
            detail: error.detail,
          }),
        ),
      );
    }
  });

  const releaseThread = (threadId: ThreadId) => locked(releaseThreadUnlocked(threadId));

  const handle = (event: Pick<OrchestrationV2DomainEvent, "type" | "threadId">) =>
    PORT_RELEASE_EVENTS.has(event.type) ? releaseThread(event.threadId) : Effect.void;

  const resume = Effect.fn("PublishedPorts.resume")(function* (record: PublishedPortRecord) {
    if (!record.hostRewrite) return { record, proxy: null } satisfies Entry;
    const sameTarget = yield* deps
      .startProxy({ upstreamPort: record.port, listenPort: record.target })
      .pipe(Effect.option);
    if (sameTarget._tag === "Some") return { record, proxy: sameTarget.value } satisfies Entry;
    const proxy = yield* deps.startProxy({ upstreamPort: record.port });
    yield* deps.tailnet.serve(record.port, proxy.port).pipe(Effect.tapError(() => proxy.close));
    return { record: { ...record, target: proxy.port }, proxy } satisfies Entry;
  });

  const reconcileUnlocked = Effect.gen(function* () {
    const records = yield* deps.store.load;
    if (records.length === 0) return;
    const served = yield* deps.tailnet.servedProxies.pipe(Effect.option);
    if (served._tag === "None") {
      yield* Effect.logWarning(
        "published ports kept without a check: tailscale serve status failed",
      );
      yield* SubscriptionRef.set(
        state,
        new Map(records.map((record) => [record.port, { record, proxy: null }])),
      );
      return;
    }
    const { kept, dropped } = reconcilePublishedPorts(records, served.value);
    if (dropped.length > 0) {
      yield* Effect.logInfo("published ports no longer served by T3 were forgotten", {
        ports: dropped.map((record) => record.port),
      });
    }
    const resumed = new Map<number, Entry>();
    for (const record of kept) {
      const entry = yield* resume(record).pipe(
        Effect.tapError(() => deps.tailnet.off(record.port).pipe(Effect.ignore)),
        Effect.option,
      );
      if (entry._tag === "Some") resumed.set(record.port, entry.value);
    }
    yield* SubscriptionRef.set(state, resumed);
    yield* save;
    for (const entry of resumed.values()) {
      if (yield* deps.threadReleased(entry.record.threadId)) {
        yield* releaseThreadUnlocked(entry.record.threadId);
      }
    }
  });

  const threadPorts = (threadId: ThreadId) =>
    SubscriptionRef.changes(state).pipe(
      Stream.map((entries): ForkPublishedPorts => ({
        ports: [...entries.values()]
          .filter((entry) => entry.record.threadId === threadId)
          .sort((left, right) => left.record.port - right.record.port)
          .map(toWire),
      })),
      Stream.changesWith(samePorts),
    );

  return {
    publish: (input) => locked(publishUnlocked(input)),
    unpublish,
    releaseThread,
    handle,
    reconcile: locked(reconcileUnlocked),
    threadPorts,
    list: SubscriptionRef.get(state).pipe(
      Effect.map((entries) => [...entries.values()].map(toWire)),
    ),
    closeProxies: SubscriptionRef.get(state).pipe(
      Effect.flatMap((entries) =>
        Effect.forEach(entries.values(), closeProxyOf, { discard: true }),
      ),
    ),
  } satisfies PublishedPorts["Service"];
});

const decodeStoreFile = Schema.decodeUnknownEffect(Schema.fromJsonString(PublishedPortsFileSchema));

const makeFileStore = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
  const filePath = path.join(config.stateDir, PUBLISHED_PORTS_FILE);
  return {
    load: fs.readFileString(filePath).pipe(
      Effect.flatMap(decodeStoreFile),
      Effect.map((file) => file.ports),
      Effect.orElseSucceed(() => []),
    ),
    save: (records) =>
      writeFileStringAtomically({
        filePath,
        contents: `${JSON.stringify({ ports: records }, null, 2)}\n`,
      }).pipe(
        Effect.provide(services),
        Effect.catchCause((cause) =>
          Effect.logWarning("the published ports file could not be written", { cause }),
        ),
      ),
  } satisfies PublishedPortsStore;
});

export const layer = Layer.effect(
  PublishedPorts,
  Effect.gen(function* () {
    const engine = yield* Orchestrator.OrchestratorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const service = yield* make({
      tailnet: yield* makeTailnetServe,
      startProxy: startHostRewriteProxy,
      store: yield* makeFileStore,
      threadReleased: (threadId) =>
        projections.getThread(threadId).pipe(
          Effect.map(threadReleasesPorts),
          Effect.orElseSucceed(() => false),
        ),
    });
    yield* Effect.addFinalizer(() => service.closeProxies);
    yield* forkParked(
      service.reconcile.pipe(
        Effect.andThen(Stream.runForEach(engine.streamDomainEvents, service.handle)),
        Effect.catchCause((cause) =>
          Effect.logWarning("published ports stopped following thread events", { cause }),
        ),
      ),
    );
    return service;
  }),
).pipe(Layer.provide(ProjectionStore.layer));
