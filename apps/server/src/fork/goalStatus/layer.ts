import * as Layer from "effect/Layer";

import * as ProjectionStore from "../../orchestration-v2/ProjectionStore.ts";
import * as GoalStallReactor from "./GoalStallReactor.ts";
import * as GoalStatus from "./GoalStatus.ts";

export const layer = Layer.mergeAll(GoalStatus.layer, GoalStallReactor.layerStarted).pipe(
  Layer.provide(ProjectionStore.layer),
);
