import { describe, expect, it } from "@effect/vitest";
import { ForkPublishedPortError, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { HostRewriteProxy } from "./hostRewriteProxy.ts";
import { make, type PublishedPortsDependencies } from "./PublishedPorts.ts";
import { loopbackTarget, type PublishedPortRecord } from "./publishedPortRules.ts";
import type { CheckResult } from "./tailnetCli.ts";

const DNS_NAME = "node.example.ts.net";
const threadA = ThreadId.make("thread-a");
const threadB = ThreadId.make("thread-b");

function setup(
  options: {
    readonly served?: ReadonlyArray<readonly [number, string | null]>;
    readonly saved?: ReadonlyArray<PublishedPortRecord>;
    readonly released?: ReadonlyArray<ThreadId>;
    readonly check?: CheckResult;
  } = {},
) {
  const served = new Map<number, string | null>(options.served ?? []);
  const turnedOff: number[] = [];
  const closedProxies: number[] = [];
  let saved: ReadonlyArray<PublishedPortRecord> = options.saved ?? [];
  let nextProxyPort = 41_000;
  const proxy = (port: number): HostRewriteProxy => ({
    port,
    close: Effect.sync(() => void closedProxies.push(port)),
  });
  const deps: PublishedPortsDependencies = {
    tailnet: {
      dnsName: Effect.succeed(DNS_NAME),
      servedProxies: Effect.sync(() => new Map(served)),
      serve: (port, target) => Effect.sync(() => void served.set(port, loopbackTarget(target))),
      off: (port) =>
        Effect.sync(() => {
          served.delete(port);
          turnedOff.push(port);
        }),
      check: () => Effect.succeed(options.check ?? { status: 200, body: "ok" }),
    },
    startProxy: ({ listenPort }) => Effect.succeed(proxy(listenPort ?? nextProxyPort++)),
    store: {
      load: Effect.sync(() => saved),
      save: (records) =>
        Effect.sync(() => {
          saved = records;
        }),
    },
    threadReleased: (threadId) => Effect.succeed(options.released?.includes(threadId) ?? false),
  };
  return {
    deps,
    served,
    turnedOff,
    closedProxies,
    saved: () => saved,
  };
}

const savedRecord = (port: number, threadId: ThreadId, target = port): PublishedPortRecord => ({
  port,
  threadId,
  target,
  hostRewrite: target !== port,
  url: `https://${DNS_NAME}:${port}/`,
});

describe("PublishedPorts", () => {
  it.effect("publishes a port and returns the checked tailnet URL", () =>
    Effect.gen(function* () {
      const fixture = setup();
      const ports = yield* make(fixture.deps);
      const published = yield* ports.publish({
        threadId: threadA,
        port: 5173,
        hostRewrite: false,
        path: "app",
      });
      expect(published.url).toBe(`https://${DNS_NAME}:5173/app`);
      expect(fixture.served.get(5173)).toBe("http://127.0.0.1:5173");
      expect(fixture.saved().map((record) => record.port)).toEqual([5173]);
    }),
  );

  it.effect("points tailscale serve at the Host-rewrite proxy", () =>
    Effect.gen(function* () {
      const fixture = setup();
      const ports = yield* make(fixture.deps);
      yield* ports.publish({ threadId: threadA, port: 3000, hostRewrite: true });
      expect(fixture.served.get(3000)).toBe("http://127.0.0.1:41000");
    }),
  );

  it.effect("turns the port off again when the URL does not answer 2xx", () =>
    Effect.gen(function* () {
      const fixture = setup({ check: { status: 403, body: "Blocked request. Host not allowed." } });
      const ports = yield* make(fixture.deps);
      const error = yield* ports
        .publish({ threadId: threadA, port: 5173, hostRewrite: false })
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(ForkPublishedPortError);
      expect(error.detail).toContain("answered 403: Blocked request. Host not allowed.");
      expect(error.detail).toContain("hostRewrite: true");
      expect(fixture.served.has(5173)).toBe(false);
      expect(yield* ports.list).toEqual([]);
    }),
  );

  it.effect("refuses a port that tailscale serve serves outside T3", () =>
    Effect.gen(function* () {
      const fixture = setup({ served: [[443, "http://127.0.0.1:8090"]] });
      const ports = yield* make(fixture.deps);
      const error = yield* ports
        .publish({ threadId: threadA, port: 443, hostRewrite: false })
        .pipe(Effect.flip);
      expect(error.detail).toContain("outside T3");
      expect(fixture.served.get(443)).toBe("http://127.0.0.1:8090");
      expect(fixture.turnedOff).toEqual([]);
    }),
  );

  it.effect("turns off only the ports of a thread that is settled or archived", () =>
    Effect.gen(function* () {
      const fixture = setup();
      const ports = yield* make(fixture.deps);
      yield* ports.publish({ threadId: threadA, port: 5173, hostRewrite: false });
      yield* ports.publish({ threadId: threadA, port: 3000, hostRewrite: true });
      yield* ports.publish({ threadId: threadB, port: 8080, hostRewrite: false });

      yield* ports.handle({ type: "thread.pinned", threadId: threadA });
      expect(fixture.turnedOff).toEqual([]);

      yield* ports.handle({ type: "thread.settled", threadId: threadA });
      expect(fixture.turnedOff.toSorted()).toEqual([3000, 5173]);
      expect(fixture.closedProxies).toEqual([41000]);
      expect((yield* ports.list).map((port) => port.port)).toEqual([8080]);

      yield* ports.handle({ type: "thread.archived", threadId: threadB });
      expect(fixture.served.size).toBe(0);
      expect(fixture.saved()).toEqual([]);
    }),
  );

  it.effect("leaves a port alone when someone re-pointed it after T3 published it", () =>
    Effect.gen(function* () {
      const fixture = setup();
      const ports = yield* make(fixture.deps);
      yield* ports.publish({ threadId: threadA, port: 5173, hostRewrite: false });
      fixture.served.set(5173, "http://127.0.0.1:6000");
      yield* ports.handle({ type: "thread.settled", threadId: threadA });
      expect(fixture.turnedOff).toEqual([]);
      expect(fixture.served.get(5173)).toBe("http://127.0.0.1:6000");
      expect(yield* ports.list).toEqual([]);
    }),
  );

  it.effect("after a restart, keeps only the ports T3 still serves and resumes their proxies", () =>
    Effect.gen(function* () {
      const fixture = setup({
        saved: [
          savedRecord(5173, threadA),
          savedRecord(3000, threadA, 45000),
          savedRecord(8080, threadA),
          savedRecord(6006, threadA),
        ],
        served: [
          [5173, "http://127.0.0.1:5173"],
          [3000, "http://127.0.0.1:45000"],
          [8080, "http://127.0.0.1:9999"],
        ],
      });
      const ports = yield* make(fixture.deps);
      yield* ports.reconcile;
      expect((yield* ports.list).map((port) => port.port).toSorted()).toEqual([3000, 5173]);
      expect(
        fixture
          .saved()
          .map((record) => record.port)
          .toSorted(),
      ).toEqual([3000, 5173]);
      expect(fixture.turnedOff).toEqual([]);
      expect(fixture.served.get(8080)).toBe("http://127.0.0.1:9999");

      yield* ports.closeProxies;
      expect(fixture.closedProxies).toEqual([45000]);
    }),
  );

  it.effect("after a restart, turns off the ports of threads settled while it was down", () =>
    Effect.gen(function* () {
      const fixture = setup({
        saved: [savedRecord(5173, threadA), savedRecord(8080, threadB)],
        served: [
          [5173, "http://127.0.0.1:5173"],
          [8080, "http://127.0.0.1:8080"],
        ],
        released: [threadA],
      });
      const ports = yield* make(fixture.deps);
      yield* ports.reconcile;
      expect(fixture.turnedOff).toEqual([5173]);
      expect((yield* ports.list).map((port) => port.port)).toEqual([8080]);
    }),
  );

  it.effect("refuses to unpublish a port T3 did not publish", () =>
    Effect.gen(function* () {
      const fixture = setup({ served: [[443, "http://127.0.0.1:8090"]] });
      const ports = yield* make(fixture.deps);
      const error = yield* ports.unpublish(443).pipe(Effect.flip);
      expect(error.detail).toContain("not published by T3");
      expect(fixture.turnedOff).toEqual([]);
    }),
  );
});
