import { assert, it } from "@effect/vitest";
import { overrideForkFeatureSettings, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type * as ProviderSessionManager from "../orchestration-v2/ProviderSessionManager.ts";
import type * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import { readForkContextUsage } from "./contextUsageRequests.ts";

it.effect("answers that the provider does not support it while Context breakdown is off", () =>
  Effect.gen(function* () {
    using _settings = overrideForkFeatureSettings({ features: { contextBreakdown: false } });
    const unused = new Proxy(
      {},
      {
        get: () => () => Effect.die("no read while Context breakdown is off"),
      },
    );
    const failure = yield* readForkContextUsage(
      {
        threadManagement: unused as ThreadManagementService.ThreadManagementService["Service"],
        providerSessions: unused as ProviderSessionManager.ProviderSessionManagerV2["Service"],
      },
      { threadId: ThreadId.make("thread:context") },
    ).pipe(Effect.flip);
    assert.equal(failure.reason, "provider-unsupported");
  }),
);
