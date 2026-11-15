import {
  CircleCheckIcon,
  CirclePauseIcon,
  CirclePlayIcon,
  Maximize2Icon,
  Minimize2Icon,
  TargetIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";

import { ComposerBanner } from "~/components/chat/ComposerBanner";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

import type { GoalChip, GoalChipTone, GoalResultLink } from "./goalStatus.logic";

export interface GoalCardModel {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly summary?: string | null;
  readonly usage: string | null;
  readonly icon?: "goal" | "paused" | "done";
  readonly chip?: GoalChip | null;
  readonly result?: GoalResultLink | null;
  readonly onOpenResult?: (href: string, event: MouseEvent<HTMLAnchorElement>) => void;
  readonly onClear: (() => void) | null;
  readonly onPause: (() => void) | null;
  readonly onResume: (() => void) | null;
  readonly onDismiss?: (() => void) | null;
}

const CHIP_TONES: Record<GoalChipTone, string> = {
  attention: "text-indigo-600 dark:text-indigo-300/90",
  warning: "text-amber-600 dark:text-amber-300/90",
  success: "text-success",
  muted: "text-muted-foreground",
};

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

function GoalCardIcon({ icon }: { readonly icon: GoalCardModel["icon"] }) {
  if (icon === "done") return <CircleCheckIcon className={CHIP_TONES.success} />;
  if (icon === "paused") return <CirclePauseIcon />;
  return <TargetIcon />;
}

function GoalCardChip({ chip }: { readonly chip: GoalChip }) {
  return (
    <span
      className={cn(
        "flex flex-none items-center gap-1 text-xs leading-7 sm:leading-6",
        CHIP_TONES[chip.tone],
      )}
    >
      {chip.tone === "muted" ? null : <ComposerBanner.Dot />}
      {chip.label}
    </span>
  );
}

function GoalCardResult({
  result,
  onOpen,
}: {
  readonly result: GoalResultLink;
  readonly onOpen: GoalCardModel["onOpenResult"];
}) {
  const { href } = result;
  if (href === null) {
    return <span className="w-0 min-w-0 grow truncate text-muted-foreground">{result.label}</span>;
  }
  return (
    <span className="w-0 min-w-0 grow truncate">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
        onClick={(event) => onOpen?.(href, event)}
      >
        {result.label}
      </a>
    </span>
  );
}

export function GoalComposerCard({ goal }: { readonly goal: GoalCardModel }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = goal.onDismiss == null;
  const showsBody = expanded && canExpand;
  return (
    <ComposerBanner.Attachment
      data-fork-goal-card={showsBody ? "expanded" : "collapsed"}
      className="transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-none"
    >
      <ComposerBanner.Root density="comfortable">
        <ComposerBanner.Row>
          <ComposerBanner.Icon>
            <GoalCardIcon icon={goal.icon} />
          </ComposerBanner.Icon>
          <ComposerBanner.Content className="gap-1.5 whitespace-nowrap">
            <span className="flex-none font-medium leading-7 sm:leading-6">{goal.title}</span>
            {goal.chip ? <GoalCardChip chip={goal.chip} /> : null}
            {goal.result ? (
              <GoalCardResult result={goal.result} onOpen={goal.onOpenResult} />
            ) : showsBody ? null : (
              <span className="w-0 min-w-0 grow truncate text-muted-foreground">
                {goal.summary ?? goal.objective}
              </span>
            )}
          </ComposerBanner.Content>
          <ComposerBanner.Actions className="gap-0.5">
            {goal.onDismiss ? (
              <GoalCardButton label="Dismiss" onClick={goal.onDismiss}>
                <XIcon className="size-3.5" />
              </GoalCardButton>
            ) : null}
            {goal.onClear ? (
              <GoalCardButton label="Clear goal" onClick={goal.onClear}>
                <Trash2Icon className="size-3.5" />
              </GoalCardButton>
            ) : null}
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
            {canExpand ? (
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
            ) : null}
          </ComposerBanner.Actions>
        </ComposerBanner.Row>
        {showsBody ? (
          <ComposerBanner.Body className="grid gap-1 pe-2 pb-1">
            <ComposerBanner.Scroll>
              {goal.summary && goal.summary !== goal.objective ? (
                <p className="whitespace-pre-wrap wrap-anywhere">{goal.summary}</p>
              ) : null}
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
