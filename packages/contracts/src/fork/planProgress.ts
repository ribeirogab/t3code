import * as Schema from "effect/Schema";

import { NonNegativeInt } from "../baseSchemas.ts";

export const ForkPlanProgress = Schema.Struct({
  done: NonNegativeInt,
  total: NonNegativeInt,
  next: Schema.NullOr(Schema.String),
});
