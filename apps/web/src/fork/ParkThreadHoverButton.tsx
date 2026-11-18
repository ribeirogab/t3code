import type { ScopedThreadRef } from "@t3tools/contracts";
import { SquareParkingIcon, SquareParkingOffIcon } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

import { setThreadParked } from "./parkedThreadActions";
import type { ParkedThreadMenuId } from "./parkedThreads.logic";

export type ParkHoverSlimRow = {
  readonly variantAction: "settle" | "unsettle" | "unsnooze";
  readonly snoozeSupported: boolean;
  readonly settlementSupported: boolean;
  readonly isWoke: boolean;
};

const BUTTON_CLASS_NAME =
  "inline-flex cursor-pointer items-center rounded-md bg-transparent px-1.5 text-xs text-muted-foreground hover:text-foreground";

const SLIM_REVEAL_CLASS_NAME =
  "pointer-events-none absolute inset-y-0 opacity-0 transition-opacity focus-visible:pointer-events-auto focus-visible:opacity-100 group-any-hover/sidebar-row:pointer-events-auto group-any-hover/sidebar-row:opacity-100";

function slimRowOffsetClassName(row: ParkHoverSlimRow): string {
  if (row.variantAction === "unsnooze") return row.snoozeSupported ? "right-5" : "right-0 -mr-1";
  if (!row.settlementSupported) return "right-0 -mr-1";
  return row.variantAction === "unsettle" ? "right-5.5" : "right-5";
}

export function ParkThreadHoverButton(props: {
  action: ParkedThreadMenuId;
  threadRef: ScopedThreadRef;
  slimRow?: ParkHoverSlimRow;
}) {
  const label = props.action === "park" ? "Park thread" : "Unpark thread";
  const Icon = props.action === "park" ? SquareParkingIcon : SquareParkingOffIcon;
  const handleClick = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void setThreadParked(props.threadRef, props.action === "park");
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={handleClick}
            onDoubleClick={(event) => event.stopPropagation()}
            className={cn(
              BUTTON_CLASS_NAME,
              props.slimRow && [
                SLIM_REVEAL_CLASS_NAME,
                slimRowOffsetClassName(props.slimRow),
                props.slimRow.isWoke && "group-any-hover/sidebar-row:static",
              ],
            )}
          />
        }
      >
        <Icon className="size-3" />
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}
