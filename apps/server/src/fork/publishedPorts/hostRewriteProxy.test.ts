// @effect-diagnostics nodeBuiltinImport:off
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeHttp from "node:http";

import { rewriteRawHeaders, startHostRewriteProxy } from "./hostRewriteProxy.ts";

const hostCheckingServer = Effect.acquireRelease(
  Effect.callback<{ readonly port: number; readonly server: NodeHttp.Server }>((resume) => {
    const server = NodeHttp.createServer((request, response) => {
      const address = server.address();
      const expectedHost =
        typeof address === "object" && address !== null ? `127.0.0.1:${address.port}` : "";
      response.writeHead(request.headers.host === expectedHost ? 200 : 403);
      response.end(`host=${request.headers.host} origin=${request.headers.origin ?? ""}`);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resume(
        Effect.succeed({
          server,
          port: typeof address === "object" && address !== null ? address.port : 0,
        }),
      );
    });
  }),
  ({ server }) => Effect.callback<void>((resume) => void server.close(() => resume(Effect.void))),
);

const get = (port: number, headers: Record<string, string>) =>
  Effect.callback<{ readonly status: number; readonly body: string }>((resume) => {
    const request = NodeHttp.request(
      { host: "127.0.0.1", port, path: "/", headers, agent: false },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (body += chunk));
        response.on("end", () =>
          resume(Effect.succeed({ status: response.statusCode ?? 0, body })),
        );
      },
    );
    request.on("error", (error) => resume(Effect.die(error)));
    request.end();
  });

describe("hostRewriteProxy", () => {
  it("rewrites Host and Origin and keeps the other headers", () => {
    expect(
      rewriteRawHeaders(
        [
          "Host",
          "node.example.ts.net:5173",
          "Origin",
          "https://node.example.ts.net:5173",
          "Accept",
          "*/*",
        ],
        5173,
      ),
    ).toEqual(["Host", "127.0.0.1:5173", "Origin", "http://127.0.0.1:5173", "Accept", "*/*"]);
  });

  it.live("lets a server that refuses a foreign Host answer 200", () =>
    Effect.gen(function* () {
      const upstream = yield* hostCheckingServer;
      const proxy = yield* Effect.acquireRelease(
        startHostRewriteProxy({ upstreamPort: upstream.port }),
        (started) => started.close,
      );
      const direct = yield* get(upstream.port, { host: "node.example.ts.net" });
      expect(direct.status).toBe(403);
      const proxied = yield* get(proxy.port, {
        host: "node.example.ts.net",
        origin: "https://node.example.ts.net",
      });
      expect(proxied.status).toBe(200);
      expect(proxied.body).toBe(
        `host=127.0.0.1:${upstream.port} origin=http://127.0.0.1:${upstream.port}`,
      );
    }).pipe(Effect.scoped),
  );
});
