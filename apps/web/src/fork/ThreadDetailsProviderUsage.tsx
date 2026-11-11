import type { ServerProvider, UsageLimitSourceSnapshots } from "@t3tools/contracts";
import { formatDuration, remainingPercent } from "@t3tools/shared/usageLimits";
import { ChevronRightIcon } from "lucide-react";

import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import { ThreadDetailsSection } from "~/components/chat/ThreadDetailsSection";
import { providerClients } from "~/components/settings/providerDriverMeta";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useNowMinute } from "~/hooks/useNowMinute";
import { usePrimarySettings } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { formatUpcomingTimestamp } from "~/timestampFormat";

import { useForkFeature } from "./forkFeatures";
import {
  collectProviderUsageEntries,
  formatPaceDelta,
  type ProviderPace,
  providerPace,
  type ProviderUsageEntry,
} from "./providerUsagePace";
import { useProviderUsageStore } from "./providerUsageStore";

const ROW_HOVER =
  "rounded-lg outline-none hover:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-popup-open:bg-black/[0.035] dark:hover:bg-white/[0.08] dark:data-popup-open:bg-white/[0.08]";

export function ForkThreadDetailsProviderUsage(props: {
  readonly providers: readonly ServerProvider[];
  readonly sources: UsageLimitSourceSnapshots;
}) {
  const enabled = useForkFeature("providerUsage");
  const expanded = useProviderUsageStore((state) => state.expanded);
  const setExpanded = useProviderUsageStore((state) => state.setExpanded);
  const nowMinute = useNowMinute();
  if (!enabled) return null;
  const now = Date.parse(`${nowMinute}:00Z`);
  const entries = collectProviderUsageEntries(props.providers, props.sources, now);
  if (entries.length === 0) return null;

  return (
    <ThreadDetailsSection
      headingId="thread-details-provider-usage-heading"
      title="Provider usage"
      showHeading={false}
    >
      <div className="flex flex-col text-xs">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className={cn("flex h-6 items-center px-2.5 text-muted-foreground", ROW_HOVER)}
        >
          Providers
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "ml-0.5 size-3 transition-transform motion-reduce:transition-none",
              expanded && "rotate-90",
            )}
          />
        </button>
        {expanded ? (
          <div className="grid grid-cols-[auto_minmax(0,1fr)_5.5rem_auto] gap-x-2 pb-1 tabular-nums">
            {entries.map((entry) => (
              <ProviderRow key={entry.account.id} entry={entry} now={now} />
            ))}
          </div>
        ) : null}
      </div>
    </ThreadDetailsSection>
  );
}

function ProviderRow({ entry, now }: { readonly entry: ProviderUsageEntry; readonly now: number }) {
  const { account, weekly } = entry;
  const name =
    account.displayName?.trim() ||
    providerClients.get(account.driver)?.label ||
    String(account.driver);
  const pace = providerPace(weekly, now);
  const left = remainingPercent(weekly);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            tabIndex={0}
            aria-label={`${name}: ${left}% left${pace ? `, ${formatPaceDelta(pace.delta)} against even pace` : ""}`}
            className={cn(
              "col-span-4 grid h-6 cursor-default grid-cols-subgrid items-center px-2.5",
              ROW_HOVER,
            )}
          />
        }
      >
        <ProviderInstanceIcon
          driverKind={account.driver}
          displayName={name}
          accentColor={account.accentColor}
          iconClassName="size-3"
        />
        <span className="truncate text-muted-foreground">{name}</span>
        <PaceBar left={left} pace={pace} />
        <span className="text-end text-3xs text-muted-foreground">
          {pace ? formatPaceDelta(pace.delta) : null}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="left" sideOffset={16}>
        <ProviderTooltip entry={entry} name={name} left={left} pace={pace} now={now} />
      </TooltipPopup>
    </Tooltip>
  );
}

function PaceBar({ left, pace }: { readonly left: number; readonly pace: ProviderPace | null }) {
  const segment = pace?.segment ?? null;
  const fill = segment ? segment.start : left;
  return (
    <span className="relative h-[3px] rounded-full bg-muted-foreground/30 dark:bg-muted-foreground/20">
      {fill > 0 ? (
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-foreground/80"
          style={{ width: `max(${fill}%, 6px)` }}
        />
      ) : null}
      {segment && pace ? (
        <span
          className={cn(
            "absolute inset-y-0 rounded-full",
            pace.kind === "deficit" ? "bg-error/75" : "bg-success",
          )}
          style={{ left: `${segment.start}%`, width: `${segment.width}%` }}
        />
      ) : null}
      {pace ? (
        <span
          aria-hidden
          className="absolute -top-[3px] h-[9px] w-px -translate-x-1/2 bg-foreground/60"
          style={{ left: `${pace.tick}%` }}
        />
      ) : null}
    </span>
  );
}

function ProviderTooltip({
  entry,
  name,
  left,
  pace,
  now,
}: {
  readonly entry: ProviderUsageEntry;
  readonly name: string;
  readonly left: number;
  readonly pace: ProviderPace | null;
  readonly now: number;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const { account, weekly } = entry;
  const resetsAt = weekly.resetsAt ? Date.parse(weekly.resetsAt) : Number.NaN;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-foreground">
        {name} · {weekly.label}: {left}% left
      </span>
      {pace ? (
        <span className="text-muted-foreground">
          {pace.kind === "deficit"
            ? `${-pace.delta}% in deficit`
            : pace.kind === "reserve"
              ? `${pace.delta}% in reserve`
              : "On pace"}
        </span>
      ) : null}
      {weekly.resetsAt && resetsAt > now ? (
        <span className="text-muted-foreground">
          Resets in {formatDuration(resetsAt - now)} ·{" "}
          {formatUpcomingTimestamp(weekly.resetsAt, timestampFormat, now)}
        </span>
      ) : null}
      <span className="my-1 border-t border-border" />
      {account.limits.windows.map((window) => (
        <span key={window.id} className="flex justify-between gap-4 text-muted-foreground">
          {window.label}
          <span className="text-foreground tabular-nums">{remainingPercent(window)}%</span>
        </span>
      ))}
    </div>
  );
}
