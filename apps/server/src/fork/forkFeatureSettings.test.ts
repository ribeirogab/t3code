import { assert, it } from "@effect/vitest";
import { forkFeatureActive, forkFeaturesOn, overrideForkFeatureSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as OrchestrationEventStore from "../persistence/OrchestrationEventStore.ts";
import * as ServerSettings from "../serverSettings.ts";
import { canResumeShellFrom } from "../orchestration-v2/ShellStream.ts";
import * as ForkFeatureSettings from "./forkFeatureSettings.ts";

const events = {
  latestApplicationSequence: Effect.succeed(42),
  prunedThroughSequence: Effect.succeed(0),
  getReplayStats: () => Effect.succeed({ eventCount: 0, rawPayloadBytes: 0 }),
} as unknown as OrchestrationEventStore.OrchestrationEventStore["Service"];

it.effect("reads the fork switches from the server settings when the server starts", () =>
  Effect.gen(function* () {
    using _restore = overrideForkFeatureSettings({});
    yield* Layer.build(
      ForkFeatureSettings.layer.pipe(
        Layer.provide(
          ServerSettings.layerTest({
            forkFeatures: { master: true, features: { sharedWorktree: false } },
          }),
        ),
        Layer.provide(Layer.succeed(OrchestrationEventStore.OrchestrationEventStore, events)),
      ),
    );
    assert.isTrue(forkFeaturesOn());
    assert.isFalse(forkFeatureActive("sharedWorktree"));
    assert.isTrue(forkFeatureActive("nestedThreads"));
  }).pipe(Effect.scoped),
);

it.effect(
  "sends a full shell snapshot to clients that hold rows from before a nesting change",
  () =>
    Effect.gen(function* () {
      using _restore = overrideForkFeatureSettings({});
      assert.isTrue(yield* canResumeShellFrom(events, 42, 42));
      yield* ForkFeatureSettings.applyForkFeatureSettings(events, {
        master: true,
        features: { forkPill: false },
      });
      assert.isTrue(yield* canResumeShellFrom(events, 42, 42));
      yield* ForkFeatureSettings.applyForkFeatureSettings(events, { master: false, features: {} });
      assert.isFalse(yield* canResumeShellFrom(events, 42, 42));
      assert.isTrue(yield* canResumeShellFrom(events, 43, 43));
    }),
);
