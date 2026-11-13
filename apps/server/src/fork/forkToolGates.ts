import {
  forkFeatureActive,
  forkFeaturesOn,
  OrchestratorMcpFailure,
  type ForkServerFeature,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";

import { withThreadIdResolution } from "./threadIdResolver.ts";

const FORK_TOOLS: Readonly<Record<string, ForkServerFeature>> = {
  t3_thread_handoff: "continueInNewThread",
  publish_port: "publishedPorts",
  unpublish_port: "publishedPorts",
  watch_workflow_run: "workflowRunWatch",
};

const FORK_PARAMETERS: Readonly<
  Record<string, ReadonlyArray<readonly [parameter: string, feature: ForkServerFeature]>>
> = {
  delegate_task: [
    ["listed", "nestedThreads"],
    ["notifyParent", "quietParentWake"],
    ["goal", "goalOnNewThreads"],
  ],
  t3_thread_launch: [["goal", "goalOnNewThreads"]],
};

export function forkToolVisible(toolName: string): boolean {
  const feature = FORK_TOOLS[toolName];
  return feature === undefined || forkFeatureActive(feature);
}

export function withoutInactiveForkParameters<Params>(toolName: string, params: Params): Params {
  const parameters = FORK_PARAMETERS[toolName];
  if (parameters === undefined || !Predicate.isObject(params)) return params;
  const inactive = parameters.filter(
    ([parameter, feature]) => parameter in params && !forkFeatureActive(feature),
  );
  if (inactive.length === 0) return params;
  const kept: Record<string, unknown> = { ...params };
  for (const [parameter] of inactive) delete kept[parameter];
  return kept as Params;
}

export function inactiveForkAction(
  toolName: string,
  params: unknown,
): OrchestratorMcpFailure | null {
  if (toolName !== "t3_thread_update" || !Predicate.isObject(params)) return null;
  if (params.action !== "set_listed" || forkFeatureActive("nestedThreads")) return null;
  return new OrchestratorMcpFailure({
    code: "invalid_request",
    message: "set_listed is off. Turn on Nested threads in Settings → Fork to use it.",
  });
}

type ToolHandler = (params: object) => Effect.Effect<unknown, OrchestratorMcpFailure>;

export function withForkToolGates<Handlers extends object>(handlers: Handlers): Handlers {
  const resolving = withThreadIdResolution(handlers) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(handlers).map(([name, handler]: [string, unknown]) => {
      if (!Predicate.isFunction(handler)) return [name, handler];
      const plain = handler as ToolHandler;
      const withResolvedIds = resolving[name] as ToolHandler;
      const gated: ToolHandler = (params) =>
        Effect.suspend(() => {
          const refusal = inactiveForkAction(name, params);
          if (refusal !== null) return Effect.fail(refusal);
          const input = withoutInactiveForkParameters(name, params);
          return forkFeaturesOn() ? withResolvedIds(input) : plain(input);
        });
      return [name, gated];
    }),
  ) as Handlers;
}
