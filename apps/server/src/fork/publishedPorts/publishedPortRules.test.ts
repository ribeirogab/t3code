import { describe, expect, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";

import {
  parseServedProxies,
  publishedPortUrl,
  reconcilePublishedPorts,
  threadReleasesPorts,
  type PublishedPortRecord,
} from "./publishedPortRules.ts";

const record = (port: number, target = port): PublishedPortRecord => ({
  port,
  threadId: ThreadId.make("thread-1"),
  target,
  hostRewrite: target !== port,
  url: `https://node.example.ts.net:${port}/`,
});

const serveStatus = (web: Record<string, string>) =>
  JSON.stringify({
    TCP: Object.fromEntries(Object.keys(web).map((port) => [port, { HTTPS: true }])),
    Web: Object.fromEntries(
      Object.entries(web).map(([port, proxy]) => [
        `node.example.ts.net:${port}`,
        { Handlers: { "/": { Proxy: proxy } } },
      ]),
    ),
  });

describe("publishedPortUrl", () => {
  it.each([
    [5173, "/", "https://node.example.ts.net:5173/"],
    [5173, "", "https://node.example.ts.net:5173/"],
    [8080, "app/login?next=1", "https://node.example.ts.net:8080/app/login?next=1"],
    [443, "/", "https://node.example.ts.net/"],
  ])("port %i with path %j", (port, path, url) => {
    expect(publishedPortUrl({ dnsName: "node.example.ts.net", port, path })).toBe(url);
  });
});

describe("parseServedProxies", () => {
  it("maps each served port to its root proxy", () => {
    const served = parseServedProxies(
      JSON.stringify({
        TCP: { "443": { HTTPS: true }, "22": { TCPForward: "127.0.0.1:22" } },
        Web: {
          "node.example.ts.net:443": { Handlers: { "/": { Proxy: "http://127.0.0.1:8090" } } },
          "node.example.ts.net:9000": { Handlers: { "/docs": { Proxy: "http://127.0.0.1:9001" } } },
        },
      }),
    );
    expect(served).toEqual(
      new Map([
        [443, "http://127.0.0.1:8090"],
        [22, null],
        [9000, null],
      ]),
    );
  });

  it("reads a node without serve config as empty", () => {
    expect(parseServedProxies("null")).toEqual(new Map());
  });

  it("rejects output that is not serve status JSON", () => {
    expect(parseServedProxies("not json")).toBeUndefined();
  });
});

describe("reconcilePublishedPorts", () => {
  it("keeps only the ports still served at the target T3 set", () => {
    const served = parseServedProxies(
      serveStatus({
        "5173": "http://127.0.0.1:5173",
        "3000": "http://127.0.0.1:41000",
        "8080": "http://127.0.0.1:9999",
        "4000": "http://localhost:4000",
      }),
    )!;
    const { kept, dropped } = reconcilePublishedPorts(
      [record(5173), record(3000, 41000), record(8080), record(4000), record(6006)],
      served,
    );
    expect(kept.map((entry) => entry.port)).toEqual([5173, 3000]);
    expect(dropped.map((entry) => entry.port)).toEqual([8080, 4000, 6006]);
  });

  it("keeps one record per port", () => {
    const served = parseServedProxies(serveStatus({ "5173": "http://127.0.0.1:5173" }))!;
    const { kept, dropped } = reconcilePublishedPorts([record(5173), record(5173)], served);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(1);
  });
});

describe("threadReleasesPorts", () => {
  it.each([
    [{ settledOverride: "settled", archivedAt: null, deletedAt: null }, true],
    [{ settledOverride: null, archivedAt: "2026-11-11T00:00:00Z", deletedAt: null }, true],
    [{ settledOverride: null, archivedAt: null, deletedAt: "2026-11-11T00:00:00Z" }, true],
    [{ settledOverride: "active", archivedAt: null, deletedAt: null }, false],
    [{ settledOverride: null, archivedAt: null, deletedAt: null }, false],
  ] as const)("%j releases: %s", (thread, releases) => {
    expect(threadReleasesPorts(thread)).toBe(releases);
  });
});
