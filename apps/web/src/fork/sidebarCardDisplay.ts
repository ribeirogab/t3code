import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

export const SIDEBAR_CARD_FIELDS = [
  { key: "project", label: "Project" },
  { key: "branch", label: "Branch" },
  { key: "machine", label: "Machine" },
  { key: "pullRequest", label: "Pull request" },
  { key: "terminal", label: "Terminal" },
  { key: "diff", label: "Diff" },
  { key: "model", label: "Model" },
] as const;

export type SidebarCardField = (typeof SIDEBAR_CARD_FIELDS)[number]["key"];

export type SidebarCardDisplay = Record<SidebarCardField, boolean>;

export const DEFAULT_SIDEBAR_CARD_DISPLAY: SidebarCardDisplay = {
  project: true,
  branch: false,
  machine: true,
  pullRequest: true,
  terminal: true,
  diff: true,
  model: true,
};

interface SidebarCardDisplayState {
  display: SidebarCardDisplay;
  setFieldVisible: (field: SidebarCardField, visible: boolean) => void;
}

export function mergePersistedSidebarCardDisplay(persisted: unknown): SidebarCardDisplay {
  const display =
    persisted !== null && typeof persisted === "object" && "display" in persisted
      ? persisted.display
      : null;
  if (display === null || typeof display !== "object") return DEFAULT_SIDEBAR_CARD_DISPLAY;
  const stored = display as Partial<Record<string, unknown>>;
  return Object.fromEntries(
    SIDEBAR_CARD_FIELDS.map(({ key }) => {
      const value = stored[key];
      return [key, typeof value === "boolean" ? value : DEFAULT_SIDEBAR_CARD_DISPLAY[key]];
    }),
  ) as SidebarCardDisplay;
}

export const useSidebarCardDisplayStore = create<SidebarCardDisplayState>()(
  persist(
    (set) => ({
      display: DEFAULT_SIDEBAR_CARD_DISPLAY,
      setFieldVisible: (field, visible) =>
        set((state) => ({ display: { ...state.display, [field]: visible } })),
    }),
    {
      name: "t3code:fork:sidebar-card-display:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ display }) => ({ display }),
      merge: (persisted, current) => ({
        ...current,
        display: mergePersistedSidebarCardDisplay(persisted),
      }),
    },
  ),
);

export function useSidebarCardDisplay(): SidebarCardDisplay {
  return useSidebarCardDisplayStore((state) => state.display);
}
