import type { OrchestrationV2AppThread, OrchestrationV2ThreadShell } from "@t3tools/contracts";

import { forkAttentionForShell } from "./goalStatus/goalStatusRules.ts";

export function forkShellFields(
  thread: Pick<OrchestrationV2AppThread, "forkAttention">,
  forkPlanProgress: OrchestrationV2ThreadShell["forkPlanProgress"] = null,
): Pick<OrchestrationV2ThreadShell, "forkPlanProgress" | "forkAttention"> {
  const forkAttention = forkAttentionForShell(thread);
  return {
    ...(forkPlanProgress == null ? {} : { forkPlanProgress }),
    ...(forkAttention === null ? {} : { forkAttention }),
  };
}
