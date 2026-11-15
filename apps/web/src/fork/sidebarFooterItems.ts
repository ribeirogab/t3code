import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";

import { primaryServerSettingsAtom } from "~/state/server";

import { sidebarFooterItemVisible, type SidebarFooterItem } from "./sidebarFooterItems.logic";

const sidebarFooterItemAtom = Atom.family((item: SidebarFooterItem) =>
  Atom.make((get) =>
    sidebarFooterItemVisible(get(primaryServerSettingsAtom).forkFeatures, item),
  ).pipe(Atom.withLabel(`fork-sidebar-footer:${item}`)),
);

export function useSidebarFooterItems() {
  return {
    fork: useAtomValue(sidebarFooterItemAtom("fork")),
    pullRequests: useAtomValue(sidebarFooterItemAtom("pullRequests")),
    usage: useAtomValue(sidebarFooterItemAtom("usage")),
  };
}
