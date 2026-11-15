import { toServerClock } from "@t3tools/client-runtime/clock";
import type { EnvironmentId } from "@t3tools/contracts";

import { useNowMinute } from "~/hooks/useNowMinute";
import type { SidebarThreadSummary } from "~/types";

import { useForkFeature } from "./forkFeatures";
import { formatWaitingDuration, waitingLabel } from "./waitingDetail.logic";

export function useForkWaitingLabel(thread: Pick<SidebarThreadSummary, "pendingBackgroundTasks">) {
  return waitingLabel(thread.pendingBackgroundTasks, useForkFeature("waitingDetail"));
}

export function ForkWaitingDuration(props: {
  environmentId: EnvironmentId;
  startedAt: string | null;
}) {
  const nowMinute = useNowMinute();
  const startedMs = props.startedAt === null ? Number.NaN : Date.parse(props.startedAt);
  if (Number.isNaN(startedMs)) return null;
  const nowMs = toServerClock(props.environmentId, Date.parse(`${nowMinute}Z`));
  return (
    <span aria-hidden className="tabular-nums">
      · {formatWaitingDuration(nowMs - startedMs)}
    </span>
  );
}
