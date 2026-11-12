import { type ForkPublishedPortError, OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as McpInvocationContext from "../../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../../mcp/McpToolAccess.ts";
import { loadCaller } from "../../mcp/threadAccess.ts";
import * as PublishedPorts from "./PublishedPorts.ts";
import { PublishedPortsToolkit } from "./tools.ts";

const toFailure = (error: ForkPublishedPortError) =>
  new OrchestratorMcpFailure({ code: "orchestration_error", message: error.detail });

const requireFullAccess = Effect.gen(function* () {
  const { limits } = yield* loadCaller();
  if (limits.runtimeMode !== "full-access") {
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "Only a full-access thread may publish a port to the tailnet.",
    });
  }
});

const handlers = {
  publish_port: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, "publish_port");
      yield* requireFullAccess;
      const ports = yield* PublishedPorts.PublishedPorts;
      const published = yield* ports
        .publish({
          threadId: thread.threadId,
          port: input.port,
          hostRewrite: input.hostRewrite === true,
          path: input.path,
        })
        .pipe(Effect.mapError(toFailure));
      return { url: published.url, port: published.port, hostRewrite: published.hostRewrite };
    }),
  ),
  unpublish_port: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const ports = yield* PublishedPorts.PublishedPorts;
      yield* ports.unpublish(input.port).pipe(Effect.mapError(toFailure));
      return { port: input.port };
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof PublishedPortsToolkit.tools>;

export const layer = McpToolAccess.toLayer(PublishedPortsToolkit, handlers);
