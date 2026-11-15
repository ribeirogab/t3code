import { isForkFeatureOn, type ForkFeatureSettings } from "@t3tools/contracts";

import type { ForkFeature } from "./forkFeatures";

export type SidebarFooterItem = "fork" | "pullRequests" | "usage";

const SIDEBAR_FOOTER_FEATURES = {
  fork: "sidebarFooterFork",
  pullRequests: "sidebarFooterPullRequests",
  usage: "sidebarFooterUsage",
} as const satisfies Record<SidebarFooterItem, ForkFeature>;

export function sidebarFooterItemVisible(
  settings: ForkFeatureSettings,
  item: SidebarFooterItem,
): boolean {
  const enabled = isForkFeatureOn(settings, SIDEBAR_FOOTER_FEATURES[item]);
  return item === "fork" ? enabled : enabled || !settings.master;
}
