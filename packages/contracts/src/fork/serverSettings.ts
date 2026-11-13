import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { TrimmedString } from "../baseSchemas.ts";
import { ForkFeatureSettings, ForkFeatureSettingsPatch } from "./forkFeatures.ts";

export const ForkServerSettingsFields = {
  agentLanguage: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  forkFeatures: ForkFeatureSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
};

export const ForkServerSettingsPatchFields = {
  agentLanguage: Schema.optionalKey(TrimmedString),
  forkFeatures: Schema.optionalKey(ForkFeatureSettingsPatch),
};
