import type { EnvironmentId, KeybindingCommand } from "@t3tools/contracts";

import { openCommandPalette } from "~/commandPaletteBus";
import { useCommandPaletteStore } from "~/commandPaletteStore";
import type { CommandPaletteUiState } from "~/components/CommandPalette.logic";
import type { DraftId } from "~/composerDraftStore";
import type { createScratchProjectActions } from "~/hooks/useScratchProject";
import { isForkFeatureEnabled } from "./forkFeatures";

type ScratchActions = Pick<
  ReturnType<typeof createScratchProjectActions>,
  "scratchEnvironmentId" | "startScratchThread"
>;

let pickerRequest: { readonly draftId: DraftId; readonly session: number } | null = null;

export function openDraftProjectPicker(draftId: DraftId): void {
  const session = useCommandPaletteStore.getState().session + 1;
  pickerRequest = { draftId, session };
  openCommandPalette({ open: "new-thread-in" });
  if (useCommandPaletteStore.getState().session !== session) pickerRequest = null;
}

export function draftProjectPickerTarget(state: CommandPaletteUiState): DraftId | null {
  return pickerRequest !== null &&
    state.openIntent?.kind === "new-thread-in" &&
    state.session === pickerRequest.session
    ? pickerRequest.draftId
    : null;
}

export function startNewThreadWithoutProject(
  scratch: ScratchActions,
  fallbackEnvironmentId: EnvironmentId | null,
): boolean {
  if (!isForkFeatureEnabled("newThreadNoProject")) return false;
  const environmentId = scratch.scratchEnvironmentId(fallbackEnvironmentId);
  if (environmentId === null) return false;
  void scratch.startScratchThread(environmentId);
  return true;
}

export function paletteNewThreadCommand(
  command: KeybindingCommand | null,
): KeybindingCommand | null {
  return command === "chat.new" && isForkFeatureEnabled("newThreadNoProject")
    ? "chat.newWithoutProject"
    : command;
}
