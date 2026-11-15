import * as Schema from "effect/Schema";

import { IsoDateTime, MessageId, RunId, ThreadId } from "../baseSchemas.ts";
import { OrchestrationV2RunStatus } from "../orchestrationV2.ts";

export const ForkThreadSendWakeInput = Schema.Boolean.annotate({
  description:
    "false: for news that needs no reply. Opens no turn: a running thread gets it now as steering, an idle one with its next turn. Ignores `mode`.",
});

export const ForkThreadSendResultFields = {
  runId: Schema.optional(RunId),
  status: Schema.optional(OrchestrationV2RunStatus),
  delivery: Schema.Literals(["started", "queued", "steered", "restarted", "held"]),
};

export const ForkHeldThreadNote = Schema.Struct({
  id: MessageId,
  threadId: ThreadId,
  senderThreadId: Schema.NullOr(ThreadId),
  text: Schema.String,
  heldAt: IsoDateTime,
});
export type ForkHeldThreadNote = typeof ForkHeldThreadNote.Type;
