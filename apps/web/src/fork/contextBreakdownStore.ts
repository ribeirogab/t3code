import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

interface ContextBreakdownState {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
}

export const useContextBreakdownStore = create<ContextBreakdownState>()(
  persist(
    (set) => ({
      expanded: false,
      setExpanded: (expanded) => set({ expanded }),
    }),
    {
      name: "t3code:fork:context-breakdown:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ expanded }) => ({ expanded }),
    },
  ),
);
