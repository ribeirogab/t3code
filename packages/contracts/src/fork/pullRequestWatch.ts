import * as Schema from "effect/Schema";

import { IsoDateTime, TrimmedNonEmptyString } from "../baseSchemas.ts";

export const ForkThreadPullRequestWatchFields = {
  conflictBaseSha: Schema.optional(TrimmedNonEmptyString),
  checksHeldSince: Schema.optional(IsoDateTime),
};
