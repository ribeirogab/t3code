import type { ScopedThreadRef } from "@t3tools/contracts";
import { TargetIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

import { placeCodeAsGoal, useUseAsGoalAvailable } from "./compactOnDemand";

export function UseAsGoalButton(props: {
  readonly threadRef: ScopedThreadRef | undefined;
  readonly code: string;
}) {
  const available = useUseAsGoalAvailable(props.threadRef);
  const { threadRef } = props;
  if (!available || threadRef === undefined) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost-muted"
            size="icon-xs"
            onClick={() => placeCodeAsGoal(threadRef, props.code)}
            aria-label="Use as goal"
          />
        }
      >
        <TargetIcon className="size-3" />
      </TooltipTrigger>
      <TooltipPopup side="top">Use as goal</TooltipPopup>
    </Tooltip>
  );
}
