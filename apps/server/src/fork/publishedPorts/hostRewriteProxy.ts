// @effect-diagnostics nodeBuiltinImport:off
import { ForkPublishedPortError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as NodeHttp from "node:http";
import * as NodeNet from "node:net";

const LOOPBACK = "127.0.0.1";

export interface HostRewriteProxy {
  readonly port: number;
  readonly close: Effect.Effect<void>;
}

export type StartHostRewriteProxy = (input: {
  readonly upstreamPort: number;
  readonly listenPort?: number;
}) => Effect.Effect<HostRewriteProxy, ForkPublishedPortError>;

function upstreamHostOf(upstreamPort: number): string {
  return `${LOOPBACK}:${upstreamPort}`;
}

export function rewriteRawHeaders(
  rawHeaders: ReadonlyArray<string>,
  upstreamPort: number,
): Array<string> {
  const upstreamHost = upstreamHostOf(upstreamPort);
  const rewritten: Array<string> = [];
  for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
    const name = rawHeaders[index]!;
    const lowerName = name.toLowerCase();
    if (lowerName === "host") rewritten.push(name, upstreamHost);
    else if (lowerName === "origin") rewritten.push(name, `http://${upstreamHost}`);
    else rewritten.push(name, rawHeaders[index + 1]!);
  }
  return rewritten;
}

function upgradeRequestHead(request: NodeHttp.IncomingMessage, upstreamPort: number): string {
  const headers = rewriteRawHeaders(request.rawHeaders, upstreamPort);
  const lines = [`${request.method} ${request.url} HTTP/${request.httpVersion}`];
  for (let index = 0; index + 1 < headers.length; index += 2) {
    lines.push(`${headers[index]}: ${headers[index + 1]}`);
  }
  return `${lines.join("\r\n")}\r\n\r\n`;
}

function forwardRequest(
  request: NodeHttp.IncomingMessage,
  response: NodeHttp.ServerResponse,
  upstreamPort: number,
) {
  const upstream = NodeHttp.request(
    {
      host: LOOPBACK,
      port: upstreamPort,
      method: request.method,
      path: request.url,
      headers: rewriteRawHeaders(request.rawHeaders, upstreamPort),
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.statusMessage,
        upstreamResponse.rawHeaders,
      );
      upstreamResponse.pipe(response);
    },
  );
  upstream.on("error", (error) => {
    if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain" });
    response.end(`${upstreamHostOf(upstreamPort)} did not answer: ${error.message}`);
  });
  request.pipe(upstream);
}

function forwardUpgrade(
  request: NodeHttp.IncomingMessage,
  socket: NodeNet.Socket,
  head: Buffer,
  upstreamPort: number,
  sockets: Set<NodeNet.Socket>,
) {
  const upstream = NodeNet.connect(upstreamPort, LOOPBACK, () => {
    upstream.write(upgradeRequestHead(request, upstreamPort));
    if (head.length > 0) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  sockets.add(upstream);
  upstream.on("close", () => sockets.delete(upstream));
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
}

export const startHostRewriteProxy: StartHostRewriteProxy = ({ upstreamPort, listenPort }) =>
  Effect.callback<HostRewriteProxy, ForkPublishedPortError>((resume) => {
    const sockets = new Set<NodeNet.Socket>();
    const server = NodeHttp.createServer((request, response) =>
      forwardRequest(request, response, upstreamPort),
    );
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    server.on("upgrade", (request, socket, head) =>
      forwardUpgrade(request, socket as NodeNet.Socket, head, upstreamPort, sockets),
    );
    const close = Effect.callback<void>((closed) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => closed(Effect.void));
    });
    server.once("error", (error) =>
      resume(
        Effect.fail(
          new ForkPublishedPortError({
            port: upstreamPort,
            detail: `The Host-rewrite proxy could not listen: ${error.message}`,
          }),
        ),
      ),
    );
    server.listen(listenPort ?? 0, LOOPBACK, () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resume(Effect.succeed({ port, close }));
    });
  });
