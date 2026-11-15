import {
  forkFeatureActive,
  type OrchestrationV2ThreadShell,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

const IdleCallerAllowed = Context.Reference<boolean>("t3/fork/IdleCallerAllowed", {
  defaultValue: () => false,
});

const IDLE_CALLER_TOOLS: ReadonlySet<string> = new Set(["unwatch_pull_request"]);

export function allowingIdleCaller<A, E, R>(
  toolName: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return IDLE_CALLER_TOOLS.has(toolName) && forkFeatureActive("stalePrWakes")
    ? Effect.provideService(effect, IdleCallerAllowed, true)
    : effect;
}

export const idleCallerAllowed = Effect.fnUntraced(function* (
  shell: Pick<OrchestrationV2ThreadShell, "archivedAt" | "providerInstanceId">,
  providerInstanceId: ProviderInstanceId | undefined,
) {
  const allowed = yield* IdleCallerAllowed;
  return allowed && shell.archivedAt === null && shell.providerInstanceId === providerInstanceId;
});
