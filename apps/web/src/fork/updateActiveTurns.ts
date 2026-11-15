import type { DesktopUpdateState } from "@t3tools/contracts";

import { environmentCatalog } from "../connection/catalog";
import { isDesktopLocalConnectionTarget } from "../connection/desktopLocal";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentThreadShells } from "../state/threads";
import { isForkFeatureEnabled } from "./forkFeatures";
import { activeTurnTitles, updateInstallConfirmation } from "./updateActiveTurns.logic";

function activeTurnTitlesOnThisApp(): string[] {
  const titles: string[] = [];
  for (const [environmentId, entry] of appAtomRegistry.get(environmentCatalog.catalogValueAtom)
    .entries) {
    if (
      entry.target._tag !== "PrimaryConnectionTarget" &&
      !isDesktopLocalConnectionTarget(entry.target)
    ) {
      continue;
    }
    titles.push(
      ...activeTurnTitles(
        appAtomRegistry.get(environmentThreadShells.environmentThreadsAtom(environmentId)),
      ),
    );
  }
  return titles;
}

export function forkUpdateInstallConfirmation(
  state: Pick<DesktopUpdateState, "availableVersion" | "downloadedVersion">,
) {
  return updateInstallConfirmation(
    state,
    isForkFeatureEnabled("updateActiveTurnsWarning") ? activeTurnTitlesOnThisApp() : [],
  );
}
