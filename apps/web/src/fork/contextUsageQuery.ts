import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "~/connection/runtime";

export const forkContextUsageQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:fork:context-usage",
  tag: WS_METHODS.forkContextUsage,
  staleTimeMs: 0,
  idleTtlMs: 60_000,
});
