import { assert, it } from "@effect/vitest";
import { forkFeatureActive, forkFeaturesOn, overrideForkFeatureSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerSettings from "../serverSettings.ts";
import * as ForkFeatureSettings from "./forkFeatureSettings.ts";

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
      ),
    );
    assert.isTrue(forkFeaturesOn());
    assert.isFalse(forkFeatureActive("sharedWorktree"));
    assert.isTrue(forkFeatureActive("nestedThreads"));
  }).pipe(Effect.scoped),
);
