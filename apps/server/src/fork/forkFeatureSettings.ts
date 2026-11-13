import { setActiveForkFeatureSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ServerSettings from "../serverSettings.ts";

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const settings = yield* ServerSettings.ServerSettingsService;
    const changes = yield* settings.subscribeChanges;
    yield* settings.getSettings.pipe(
      Effect.tap((current) =>
        Effect.sync(() => setActiveForkFeatureSettings(current.forkFeatures)),
      ),
      Effect.catch((error) =>
        Effect.logWarning("fork feature settings could not be read", { error }),
      ),
    );
    yield* Effect.forkScoped(
      Stream.runForEach(changes, (next) =>
        Effect.sync(() => setActiveForkFeatureSettings(next.forkFeatures)),
      ),
    );
  }),
);
