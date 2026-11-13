import {
  forkFeatureActive,
  setActiveForkFeatureSettings,
  type ForkFeatureSettings,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as OrchestrationEventStore from "../persistence/OrchestrationEventStore.ts";
import * as ServerSettings from "../serverSettings.ts";

let shellResumeRefusedThrough = -1;

export function forkRefusesShellResume(afterSequence: number): boolean {
  return afterSequence <= shellResumeRefusedThrough;
}

export const applyForkFeatureSettings = Effect.fnUntraced(function* (
  events: Pick<
    OrchestrationEventStore.OrchestrationEventStore["Service"],
    "latestApplicationSequence"
  >,
  next: ForkFeatureSettings,
) {
  const nestedBefore = forkFeatureActive("nestedThreads");
  setActiveForkFeatureSettings(next);
  if (forkFeatureActive("nestedThreads") === nestedBefore) return;
  shellResumeRefusedThrough = yield* events.latestApplicationSequence.pipe(
    Effect.orElseSucceed(() => Number.MAX_SAFE_INTEGER),
  );
});

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const settings = yield* ServerSettings.ServerSettingsService;
    const events = yield* OrchestrationEventStore.OrchestrationEventStore;
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
      Stream.runForEach(changes, (next) => applyForkFeatureSettings(events, next.forkFeatures)),
    );
  }),
);
