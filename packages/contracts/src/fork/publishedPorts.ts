import * as Schema from "effect/Schema";

import { ThreadId } from "../baseSchemas.ts";

export const ForkPortNumber = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_535 }));

export const ForkPublishedPort = Schema.Struct({
  port: ForkPortNumber,
  threadId: ThreadId,
  url: Schema.String,
  hostRewrite: Schema.Boolean,
});
export type ForkPublishedPort = typeof ForkPublishedPort.Type;

export const ForkPublishedPortsInput = Schema.Struct({
  threadId: ThreadId,
});
export type ForkPublishedPortsInput = typeof ForkPublishedPortsInput.Type;

export const ForkPublishedPorts = Schema.Struct({
  ports: Schema.Array(ForkPublishedPort),
});
export type ForkPublishedPorts = typeof ForkPublishedPorts.Type;

export const ForkUnpublishPortInput = Schema.Struct({
  port: ForkPortNumber,
});
export type ForkUnpublishPortInput = typeof ForkUnpublishPortInput.Type;

export class ForkPublishedPortError extends Schema.TaggedError<ForkPublishedPortError>()(
  "ForkPublishedPortError",
  {
    port: Schema.optional(Schema.Int),
    detail: Schema.String,
  },
) {
  override get message(): string {
    return this.detail;
  }
}
