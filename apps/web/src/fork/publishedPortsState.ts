import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "~/connection/runtime";

export const forkPublishedPortsSubscription = createEnvironmentRpcSubscriptionAtomFamily(
  connectionAtomRuntime,
  {
    label: "environment-data:fork:published-ports",
    tag: WS_METHODS.forkSubscribePublishedPorts,
  },
);

export const forkUnpublishPort = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:fork:unpublish-port",
  tag: WS_METHODS.forkUnpublishPort,
});
