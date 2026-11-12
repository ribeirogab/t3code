import { ForkPortNumber, OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as McpInvocationContext from "../../mcp/McpInvocationContext.ts";
import * as ThreadManagementService from "../../orchestration-v2/ThreadManagementService.ts";
import * as PublishedPorts from "./PublishedPorts.ts";

const Port = ForkPortNumber.annotate({ description: "Local port on 127.0.0.1." });

const PublishPortTool = Tool.make("publish_port", {
  description:
    "Publish a local HTTP port to the tailnet with tailscale serve, HTTPS on the same port number. Checks that the URL answers 2xx and returns it. The port closes when this thread is settled or archived.",
  parameters: Schema.Struct({
    port: Port,
    hostRewrite: Schema.optional(
      Schema.Boolean.annotate({
        description: "Send Host 127.0.0.1:<port>, for servers that refuse a foreign Host (403).",
      }),
    ),
    path: Schema.optional(
      Schema.String.annotate({ description: "Path to check and return. Default /." }),
    ),
  }),
  success: Schema.Struct({
    url: Schema.String,
    port: Schema.Int,
    hostRewrite: Schema.Boolean,
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    PublishedPorts.PublishedPorts,
  ],
})
  .annotate(Tool.Title, "Publish port")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

const UnpublishPortTool = Tool.make("unpublish_port", {
  description: "Turn off a port that publish_port published.",
  parameters: Schema.Struct({ port: Port }),
  success: Schema.Struct({ port: Schema.Int }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    PublishedPorts.PublishedPorts,
  ],
})
  .annotate(Tool.Title, "Unpublish port")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const PublishedPortsToolkit = Toolkit.make(PublishPortTool, UnpublishPortTool);
