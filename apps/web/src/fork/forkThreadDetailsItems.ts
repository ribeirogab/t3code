import { THREAD_DETAILS_ITEMS } from "~/components/chat/threadDetailsItems";

import { useForkFeature } from "./forkFeatures";

export function useForkThreadDetailsItems() {
  const providerUsage = useForkFeature("providerUsage");
  return THREAD_DETAILS_ITEMS.filter((item) => providerUsage || item.id !== "providerUsage");
}
