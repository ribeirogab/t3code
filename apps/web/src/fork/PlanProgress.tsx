import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { ListChecksIcon } from "lucide-react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useThreadShell } from "~/state/entities";

import { useForkFeature } from "./forkFeatures";

type PlanProgress = NonNullable<EnvironmentThreadShell["source"]["forkPlanProgress"]>;

function PlanProgressText({ progress }: { readonly progress: PlanProgress }) {
  return (
    <>
      <ListChecksIcon aria-hidden className="size-3 shrink-0" />
      <span className="shrink-0 tabular-nums">
        {progress.done}/{progress.total}
      </span>
      {progress.next ? (
        <>
          <span aria-hidden className="shrink-0">
            ·
          </span>
          <span className="min-w-0 truncate">{progress.next}</span>
        </>
      ) : null}
    </>
  );
}

export function SidebarPlanProgress({ thread }: { readonly thread: EnvironmentThreadShell }) {
  const enabled = useForkFeature("planProgress");
  const progress = thread.source.forkPlanProgress;
  if (!enabled || !progress) return null;
  return (
    <div
      data-fork-plan-progress
      className="mt-1 flex min-w-0 items-center gap-1 text-secondary-label text-xs"
    >
      <PlanProgressText progress={progress} />
    </div>
  );
}

export function ThreadHeaderPlanProgress({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  const enabled = useForkFeature("planProgress");
  const progress = useThreadShell(enabled ? threadRef : null)?.source.forkPlanProgress;
  if (!progress) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            data-fork-plan-progress
            className="flex min-w-0 max-w-64 shrink items-center gap-1 text-muted-foreground text-xs"
          />
        }
      >
        <PlanProgressText progress={progress} />
      </TooltipTrigger>
      <TooltipPopup side="bottom">{progress.next ?? "Plan done"}</TooltipPopup>
    </Tooltip>
  );
}
