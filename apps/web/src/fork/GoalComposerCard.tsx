import {
  CirclePauseIcon,
  CirclePlayIcon,
  Maximize2Icon,
  Minimize2Icon,
  TargetIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { ComposerBanner } from "~/components/chat/ComposerBanner";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

export interface GoalCardModel {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly usage: string | null;
  readonly onClear: () => void;
  readonly onPause: (() => void) | null;
  readonly onResume: (() => void) | null;
}

function GoalCardButton({
  label,
  onClick,
  expanded,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly expanded?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost-muted"
            aria-label={label}
            aria-expanded={expanded}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

export function GoalComposerCard({ goal }: { readonly goal: GoalCardModel }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <ComposerBanner.Attachment
      data-fork-goal-card={expanded ? "expanded" : "collapsed"}
      className="transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-none"
    >
      <ComposerBanner.Root density="comfortable">
        <ComposerBanner.Row>
          <ComposerBanner.Icon>
            <TargetIcon />
          </ComposerBanner.Icon>
          <ComposerBanner.Content className="gap-1.5 whitespace-nowrap">
            <span className="flex-none font-medium leading-7 sm:leading-6">{goal.title}</span>
            {expanded ? null : (
              <span className="w-0 min-w-0 grow truncate text-muted-foreground">
                {goal.objective}
              </span>
            )}
          </ComposerBanner.Content>
          <ComposerBanner.Actions className="gap-0.5">
            <GoalCardButton label="Clear goal" onClick={goal.onClear}>
              <Trash2Icon className="size-3.5" />
            </GoalCardButton>
            {goal.onPause ? (
              <GoalCardButton label="Pause goal" onClick={goal.onPause}>
                <CirclePauseIcon className="size-3.5" />
              </GoalCardButton>
            ) : null}
            {goal.onResume ? (
              <GoalCardButton label="Resume goal" onClick={goal.onResume}>
                <CirclePlayIcon className="size-3.5" />
              </GoalCardButton>
            ) : null}
            <GoalCardButton
              label={expanded ? "Hide full goal" : "Show full goal"}
              expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <Minimize2Icon className="size-3.5" />
              ) : (
                <Maximize2Icon className="size-3.5" />
              )}
            </GoalCardButton>
          </ComposerBanner.Actions>
        </ComposerBanner.Row>
        {expanded ? (
          <ComposerBanner.Body className="grid gap-1 pe-2 pb-1">
            <ComposerBanner.Scroll>
              <p className="whitespace-pre-wrap wrap-anywhere text-muted-foreground">
                {goal.objective}
              </p>
            </ComposerBanner.Scroll>
            {goal.usage ? (
              <p className="text-muted-foreground/70 tabular-nums">{goal.usage}</p>
            ) : null}
          </ComposerBanner.Body>
        ) : null}
      </ComposerBanner.Root>
    </ComposerBanner.Attachment>
  );
}
