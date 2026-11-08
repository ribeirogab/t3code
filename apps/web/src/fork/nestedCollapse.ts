import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

interface NestedCollapseState {
  collapsedKeys: readonly string[];
  toggle: (threadKey: string) => void;
}

function mergePersistedCollapsedKeys(persisted: unknown): readonly string[] {
  const keys =
    persisted !== null && typeof persisted === "object" && "collapsedKeys" in persisted
      ? persisted.collapsedKeys
      : null;
  return Array.isArray(keys) ? keys.filter((key) => typeof key === "string") : [];
}

export const useNestedCollapseStore = create<NestedCollapseState>()(
  persist(
    (set) => ({
      collapsedKeys: [],
      toggle: (threadKey) =>
        set((state) => ({
          collapsedKeys: state.collapsedKeys.includes(threadKey)
            ? state.collapsedKeys.filter((key) => key !== threadKey)
            : [...state.collapsedKeys, threadKey],
        })),
    }),
    {
      name: "t3code:fork:sidebar-nested-collapsed:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ collapsedKeys }) => ({ collapsedKeys }),
      merge: (persisted, current) => ({
        ...current,
        collapsedKeys: mergePersistedCollapsedKeys(persisted),
      }),
    },
  ),
);

export function useNestedCollapsedKeys(): ReadonlySet<string> {
  const keys = useNestedCollapseStore((state) => state.collapsedKeys);
  return new Set(keys);
}
