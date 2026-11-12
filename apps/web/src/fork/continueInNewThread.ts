import type { ContextMenuItem, ThreadHandoffPlacement } from "@t3tools/contracts";

const MENU_ID = "continue-in-new-thread";

export type ContinueInNewThreadMenuId =
  | typeof MENU_ID
  | `${typeof MENU_ID}:${ThreadHandoffPlacement}`;

const PLACEMENT_LABELS: Readonly<Record<ThreadHandoffPlacement, string>> = {
  same_worktree: "Same worktree",
  new_worktree: "New worktree",
  child: "Child thread",
};

const PLACEMENTS = Object.keys(PLACEMENT_LABELS) as ReadonlyArray<ThreadHandoffPlacement>;

export function continueInNewThreadMenuItems(
  enabled: boolean,
): ReadonlyArray<ContextMenuItem<ContinueInNewThreadMenuId>> {
  if (!enabled) return [];
  return [
    {
      id: MENU_ID,
      label: "Continue in new thread",
      icon: "message-square-plus",
      children: PLACEMENTS.map((placement) => ({
        id: `${MENU_ID}:${placement}` as const,
        label: PLACEMENT_LABELS[placement],
      })),
    },
  ];
}

export function continueInNewThreadPlacement(action: string): ThreadHandoffPlacement | null {
  return PLACEMENTS.find((placement) => action === `${MENU_ID}:${placement}`) ?? null;
}

export function continueInNewThreadPrompt(placement: ThreadHandoffPlacement): string {
  const settle = placement === "child" ? "" : " and `settle: true`";
  return [
    "Continue this work in a new thread.",
    "Write a short, self-contained handoff for the next agent: the aim, what is done, what is next, and the files, branches, PRs, and decisions it needs. Leave out what it can read in the repository.",
    `Then call \`t3_thread_handoff\` with the handoff, a short title, \`placement: "${placement}"\`${settle}. Add \`goal\` with what done means when the rest of the work has a clear end.`,
    "Call it last in your turn and reply with the new thread's link.",
  ].join("\n\n");
}
