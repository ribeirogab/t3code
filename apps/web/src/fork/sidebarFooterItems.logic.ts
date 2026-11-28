import { isForkFeatureOn, type ForkFeatureSettings } from "@t3tools/contracts";

import type { ForkFeature } from "./forkFeatures";

export type SidebarFooterItem = "fork" | "pullRequests" | "usage";

const HIDDEN_SIDEBAR_FOOTER_ITEMS = {
  pullRequests: "hideSidebarFooterPullRequests",
  usage: "hideSidebarFooterUsage",
} as const satisfies Record<Exclude<SidebarFooterItem, "fork">, ForkFeature>;

export function sidebarFooterItemVisible(
  settings: ForkFeatureSettings,
  item: SidebarFooterItem,
): boolean {
  return item === "fork"
    ? isForkFeatureOn(settings, "sidebarFooterFork")
    : !isForkFeatureOn(settings, HIDDEN_SIDEBAR_FOOTER_ITEMS[item]);
}
