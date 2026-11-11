import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

interface ProviderUsageState {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
}

export const useProviderUsageStore = create<ProviderUsageState>()(
  persist(
    (set) => ({
      expanded: false,
      setExpanded: (expanded) => set({ expanded }),
    }),
    {
      name: "t3code:fork:provider-usage:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ expanded }) => ({ expanded }),
    },
  ),
);
