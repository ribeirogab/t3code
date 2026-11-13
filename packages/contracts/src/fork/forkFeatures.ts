import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export type ForkServerFeature =
  | "planProgress"
  | "nestedThreads"
  | "supervisedTurn"
  | "contextBreakdown"
  | "sharedWorktree"
  | "publishedPorts"
  | "continueInNewThread"
  | "orchestrationRules"
  | "quietParentWake"
  | "holdRunningPrChecks"
  | "workflowRunWatch"
  | "goalOnNewThreads"
  | "parkedThreads";

export const ForkFeatureSettings = Schema.Struct({
  master: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  features: Schema.Record(Schema.String, Schema.Boolean).pipe(
    Schema.withDecodingDefault(Effect.succeed({})),
  ),
});
export type ForkFeatureSettings = typeof ForkFeatureSettings.Type;

export const ForkFeatureSettingsPatch = Schema.Struct({
  master: Schema.optionalKey(Schema.Boolean),
  features: Schema.optionalKey(Schema.Record(Schema.String, Schema.Boolean)),
});

export const DEFAULT_FORK_FEATURE_SETTINGS: ForkFeatureSettings = { master: true, features: {} };

export function isForkFeatureOn(settings: ForkFeatureSettings, feature: string): boolean {
  return settings.master && settings.features[feature] !== false;
}

let activeForkFeatureSettings = DEFAULT_FORK_FEATURE_SETTINGS;

export function setActiveForkFeatureSettings(settings: ForkFeatureSettings): void {
  activeForkFeatureSettings = settings;
}

export function forkFeaturesOn(): boolean {
  return activeForkFeatureSettings.master;
}

export function forkFeatureActive(feature: ForkServerFeature): boolean {
  return isForkFeatureOn(activeForkFeatureSettings, feature);
}

export function overrideForkFeatureSettings(settings: Partial<ForkFeatureSettings>): Disposable {
  const previous = activeForkFeatureSettings;
  activeForkFeatureSettings = { ...DEFAULT_FORK_FEATURE_SETTINGS, ...settings };
  return {
    [Symbol.dispose]: () => {
      activeForkFeatureSettings = previous;
    },
  };
}
