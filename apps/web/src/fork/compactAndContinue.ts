import type { ContextMenuItem } from "@t3tools/contracts";

const MENU_ID = "compact-and-continue";

export type CompactAndContinueMenuId = typeof MENU_ID;

export const COMPACT_AND_CONTINUE_RESUME_TEXT = "Continue where you left off.";

export function compactAndContinueMenuItems(
  enabled: boolean,
): ReadonlyArray<ContextMenuItem<CompactAndContinueMenuId>> {
  return enabled ? [{ id: MENU_ID, label: "Compact and continue", icon: "minimize-2" }] : [];
}

export function isCompactAndContinueAction(action: string): action is CompactAndContinueMenuId {
  return action === MENU_ID;
}
