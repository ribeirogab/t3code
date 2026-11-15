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
  | "stalePrWakes"
  | "workflowRunWatch"
  | "waitingDetail"
  | "goalOnNewThreads"
  | "parkedThreads"
  | "ownerFacingTasks"
  | "quietThreadSend"
  | "archiveAfterTurn"
  | "goalStatus"
  | "goalQuestionPause"
  | "compactAndContinueTool"
  | "requestAttention"
  | "agentLanguage"
  | "threadIdRepair";

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

const DEFAULT_OFF_FORK_FEATURES: Readonly<Record<string, string>> = {
  hideSidebarFooterPullRequests: "sidebarFooterPullRequests",
  hideSidebarFooterUsage: "sidebarFooterUsage",
};

export function forkFeatureChoice(
  features: ForkFeatureSettings["features"],
  feature: string,
): boolean {
  const choice = features[feature];
  if (choice !== undefined) return choice;
  const replacedFeature = DEFAULT_OFF_FORK_FEATURES[feature];
  return replacedFeature === undefined || features[replacedFeature] === false;
}

export function isForkFeatureOn(settings: ForkFeatureSettings, feature: string): boolean {
  return settings.master && forkFeatureChoice(settings.features, feature);
}

let activeForkFeatureSettings = DEFAULT_FORK_FEATURE_SETTINGS;
const settingsListeners = new Set<() => void>();

export function setActiveForkFeatureSettings(settings: ForkFeatureSettings): void {
  activeForkFeatureSettings = settings;
  for (const listener of settingsListeners) listener();
}

export function onForkFeatureSettingsChange(listener: () => void): Disposable {
  settingsListeners.add(listener);
  return {
    [Symbol.dispose]: () => {
      settingsListeners.delete(listener);
    },
  };
}

export function forkFeatureActive(feature: ForkServerFeature): boolean {
  return isForkFeatureOn(activeForkFeatureSettings, feature);
}

export function overrideForkFeatureSettings(settings: Partial<ForkFeatureSettings>): Disposable {
  const previous = activeForkFeatureSettings;
  setActiveForkFeatureSettings({ ...DEFAULT_FORK_FEATURE_SETTINGS, ...settings });
  return {
    [Symbol.dispose]: () => {
      setActiveForkFeatureSettings(previous);
    },
  };
}

export const agentLanguageLine = (language: string) => `Answer the user in ${language}.`;

let activeAgentLanguage = "";

export function setActiveAgentLanguage(language: string): void {
  activeAgentLanguage = language;
}

export function forkAgentLanguage(): string {
  return forkFeatureActive("agentLanguage") ? activeAgentLanguage : "";
}

export function overrideAgentLanguage(language: string): Disposable {
  const previous = activeAgentLanguage;
  activeAgentLanguage = language;
  return {
    [Symbol.dispose]: () => {
      activeAgentLanguage = previous;
    },
  };
}
