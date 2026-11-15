import type {
  ConfirmDialogOptions,
  DesktopUpdateState,
  OrchestrationV2ThreadShell,
} from "@t3tools/contracts";

import { getDesktopUpdateInstallConfirmationMessage } from "../components/desktopUpdate.logic";

const ACTIVE_TURN_STATUSES = new Set<OrchestrationV2ThreadShell["status"]>([
  "preparing",
  "starting",
  "running",
]);

export function activeTurnTitles(
  threads: ReadonlyArray<Pick<OrchestrationV2ThreadShell, "status" | "title">>,
): string[] {
  return threads
    .filter((thread) => ACTIVE_TURN_STATUSES.has(thread.status))
    .map((thread) => thread.title);
}

export function updateInstallConfirmation(
  state: Pick<DesktopUpdateState, "availableVersion" | "downloadedVersion">,
  titles: ReadonlyArray<string>,
): readonly [message: string, options: ConfirmDialogOptions] {
  if (titles.length === 0) {
    return [getDesktopUpdateInstallConfirmationMessage(state), { initialFocus: "confirm" }];
  }
  const version = state.downloadedVersion ?? state.availableVersion;
  const count =
    titles.length === 1
      ? "1 thread has an active turn"
      : `${titles.length} threads have an active turn`;
  return [
    [
      `Install update${version ? ` ${version}` : ""} and restart T3 Code?`,
      "",
      count,
      ...titles,
      "",
      "Installing now stops them.",
    ].join("\n"),
    { initialFocus: "cancel" },
  ];
}
