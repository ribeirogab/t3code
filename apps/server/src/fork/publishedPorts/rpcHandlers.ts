import {
  type ForkPublishedPortsInput,
  type ForkUnpublishPortInput,
  WS_METHODS,
} from "@t3tools/contracts";

import type * as PublishedPorts from "./PublishedPorts.ts";

export const publishedPortsRpcHandlers = (service: PublishedPorts.PublishedPorts["Service"]) => ({
  [WS_METHODS.forkSubscribePublishedPorts]: (input: ForkPublishedPortsInput) =>
    service.threadPorts(input.threadId),
  [WS_METHODS.forkUnpublishPort]: (input: ForkUnpublishPortInput) => service.unpublish(input.port),
});
