import { forkFeatureActive, type ForkServerFeature } from "@t3tools/contracts";

const FORK_TOOLS: Readonly<Record<string, ForkServerFeature>> = {
  publish_port: "publishedPorts",
  unpublish_port: "publishedPorts",
};

export function forkToolVisible(toolName: string): boolean {
  const feature = FORK_TOOLS[toolName];
  return feature === undefined || forkFeatureActive(feature);
}
