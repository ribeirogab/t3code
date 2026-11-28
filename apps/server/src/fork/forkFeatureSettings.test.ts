import { assert, it } from "@effect/vitest";
import {
  forkAgentLanguage,
  forkFeatureActive,
  overrideAgentLanguage,
  overrideForkFeatureSettings,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerSettings from "../serverSettings.ts";
import * as ForkFeatureSettings from "./forkFeatureSettings.ts";

it.effect("reads the fork switches from the server settings when the server starts", () =>
  Effect.gen(function* () {
    using _restore = overrideForkFeatureSettings({});
    using _language = overrideAgentLanguage("");
    yield* Layer.build(
      ForkFeatureSettings.layer.pipe(
        Layer.provide(
          ServerSettings.layerTest({
            agentLanguage: "Brazilian Portuguese",
            forkFeatures: { master: true, features: { publishedPorts: false } },
          }),
        ),
      ),
    );
    assert.isFalse(forkFeatureActive("publishedPorts"));
    assert.isTrue(forkFeatureActive("parkedThreads"));
    assert.equal(forkAgentLanguage(), "Brazilian Portuguese");
  }).pipe(Effect.scoped),
);
