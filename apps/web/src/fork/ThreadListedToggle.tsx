import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  AuthOrchestrationOperateScope,
  isListedThreadLineage,
  type EnvironmentId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";

import { ThreadDetailsControl } from "~/components/chat/ThreadDetailsControl";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useEnvironmentScope } from "~/state/session";

import { useSetThreadListed } from "./useSetThreadListed";

type ListableThread = Pick<OrchestrationV2ThreadShell, "id" | "lineage">;

export function canToggleThreadListed(
  thread: ListableThread | null | undefined,
  isParent: boolean,
): thread is ListableThread {
  return (
    thread != null &&
    !isParent &&
    thread.lineage.parentThreadId !== null &&
    thread.lineage.sideChat !== true
  );
}

export function ThreadListedToggle(props: {
  readonly environmentId: EnvironmentId;
  readonly thread: ListableThread;
  readonly threadTitle: string;
}) {
  const canOperate = useEnvironmentScope(props.environmentId, AuthOrchestrationOperateScope);
  const setThreadListed = useSetThreadListed();
  const [pending, setPending] = useState(false);
  if (!canOperate) return null;
  const listed = isListedThreadLineage(props.thread.lineage);
  const label = listed ? "Hide from sidebar" : "Show in sidebar";
  const toggle = async () => {
    setPending(true);
    await setThreadListed(scopeThreadRef(props.environmentId, props.thread.id), !listed);
    setPending(false);
  };
  return (
    <div className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
      <Tooltip>
        <TooltipTrigger
          render={
            <ThreadDetailsControl
              size="icon-xs"
              variant="ghost"
              part="icon"
              aria-label={`${label}: ${props.threadTitle}`}
              disabled={pending}
              onClick={() => void toggle()}
            />
          }
        >
          {listed ? (
            <EyeOffIcon aria-hidden className="size-3" />
          ) : (
            <EyeIcon aria-hidden className="size-3" />
          )}
        </TooltipTrigger>
        <TooltipPopup side="left">{label}</TooltipPopup>
      </Tooltip>
    </div>
  );
}
