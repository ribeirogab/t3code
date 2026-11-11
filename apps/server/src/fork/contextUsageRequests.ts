import { ForkContextUsageError, type ForkContextUsageInput } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type * as ProviderSessionManager from "../orchestration-v2/ProviderSessionManager.ts";
import type * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";

export const readForkContextUsage = Effect.fn("ForkContextUsage.read")(function* (
  services: {
    readonly threadManagement: ThreadManagementService.ThreadManagementService["Service"];
    readonly providerSessions: ProviderSessionManager.ProviderSessionManagerV2["Service"];
  },
  input: ForkContextUsageInput,
) {
  const fail = (reason: ForkContextUsageError["reason"], cause?: unknown) =>
    new ForkContextUsageError({
      threadId: input.threadId,
      reason,
      ...(cause === undefined ? {} : { cause }),
    });
  const projection = yield* services.threadManagement
    .getThreadRecords(input.threadId, ["providerThreads"])
    .pipe(Effect.mapError((cause) => fail("request-failed", cause)));
  const providerThread =
    projection.providerThreads.find(
      (candidate) => candidate.id === projection.thread.activeProviderThreadId,
    ) ?? projection.providerThreads.at(-1);
  if (providerThread?.providerSessionId == null) return yield* fail("session-stopped");
  const runtime = Option.getOrUndefined(
    yield* services.providerSessions
      .get(providerThread.providerSessionId)
      .pipe(Effect.mapError((cause) => fail("request-failed", cause))),
  );
  if (runtime === undefined) return yield* fail("session-stopped");
  if (runtime.readContextUsage === undefined) return yield* fail("provider-unsupported");
  return yield* runtime
    .readContextUsage({ providerThread })
    .pipe(
      Effect.mapError((cause) =>
        fail(
          cause._tag === "ProviderAdapterSessionStoppedError"
            ? "session-stopped"
            : "request-failed",
          cause,
        ),
      ),
    );
});
