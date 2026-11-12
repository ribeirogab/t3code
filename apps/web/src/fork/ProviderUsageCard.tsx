import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import { formatDuration, remainingPercent } from "@t3tools/shared/usageLimits";

import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import { providerClients } from "~/components/settings/providerDriverMeta";
import { usePrimarySettings } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { formatRelativeTimeLabel, formatUpcomingTimestamp } from "~/timestampFormat";

import {
  type ProviderPace,
  providerPace,
  type ProviderUsageEntry,
  type WeeklyProjection,
  weeklyProjection,
} from "./providerUsagePace";

export function providerUsageName(account: ProviderUsageEntry["account"]): string {
  return (
    account.displayName?.trim() ||
    providerClients.get(account.driver)?.label ||
    String(account.driver)
  );
}

export function PaceBar({
  left,
  pace,
  size = "sm",
}: {
  readonly left: number;
  readonly pace: ProviderPace | null;
  readonly size?: "sm" | "lg";
}) {
  const segment = pace?.segment ?? null;
  const fill = segment ? segment.start : left;
  return (
    <span
      className={cn(
        "relative rounded-full bg-muted-foreground/30 dark:bg-muted-foreground/20",
        size === "lg" ? "block h-1" : "h-[3px]",
      )}
    >
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
          className={cn(
            "absolute -top-[3px] w-px -translate-x-1/2 bg-foreground/60",
            size === "lg" ? "h-[10px]" : "h-[9px]",
          )}
          style={{ left: `${pace.tick}%` }}
        />
      ) : null}
    </span>
  );
}

export function ProviderUsageCard({
  entry,
  now,
}: {
  readonly entry: ProviderUsageEntry;
  readonly now: number;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const { account, weekly } = entry;
  const name = providerUsageName(account);
  const left = remainingPercent(weekly);
  const pace = providerPace(weekly, now);
  const projection = weeklyProjection(weekly, now);
  const resetsAt = weekly.resetsAt ? Date.parse(weekly.resetsAt) : Number.NaN;
  const otherWindows = account.limits.windows.filter((window) => window.id !== weekly.id);
  const credits = account.limits.resetCredits;
  return (
    <div className="flex flex-col px-3 py-2.5 text-xs leading-snug tabular-nums">
      <div className="flex items-center gap-2">
        <ProviderInstanceIcon
          driverKind={account.driver}
          displayName={name}
          accentColor={account.accentColor}
          iconClassName="size-3.5"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{name}</div>
          {account.email ? (
            <div className="truncate text-2xs text-muted-foreground">{account.email}</div>
          ) : null}
        </div>
        {account.plan ? (
          <span className="max-w-2/5 truncate rounded-full border px-1.5 text-3xs text-muted-foreground">
            {account.plan}
          </span>
        ) : null}
      </div>
      <CardRule />
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-muted-foreground">{weekly.label}</span>
        <span className="text-sm font-medium">
          {left}%<span className="ml-0.5 text-2xs font-normal text-muted-foreground">left</span>
        </span>
      </div>
      <PaceBar left={left} pace={pace} size="lg" />
      {pace || projection ? (
        <div className="mt-1.5 flex justify-between gap-2">
          {pace ? <PaceLabel pace={pace} /> : <span />}
          {projection ? <ProjectionLabel projection={projection} /> : null}
        </div>
      ) : null}
      {weekly.resetsAt && resetsAt > now ? (
        <div className="mt-1.5 flex justify-between gap-2 text-muted-foreground">
          <span>Resets in {formatDuration(resetsAt - now)}</span>
          <span>{formatUpcomingTimestamp(weekly.resetsAt, timestampFormat, now)}</span>
        </div>
      ) : null}
      {otherWindows.length > 0 ? (
        <>
          <CardRule />
          {otherWindows.map((window) => (
            <WindowRow key={window.id} window={window} now={now} />
          ))}
        </>
      ) : null}
      <CardRule />
      <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-2xs text-muted-foreground">
        <span>
          {credits && credits.availableCount > 0
            ? `${credits.availableCount} ${credits.availableCount === 1 ? "reset" : "resets"} banked${
                credits.nextExpiresAt
                  ? ` · expires in ${formatDuration(Date.parse(credits.nextExpiresAt) - now)}`
                  : ""
              }`
            : null}
        </span>
        <span className="ml-auto">
          Updated {formatRelativeTimeLabel(account.limits.checkedAt, now)}
        </span>
      </div>
    </div>
  );
}

function CardRule() {
  return <div className="-mx-3 my-2 h-px bg-border" />;
}

function PaceLabel({ pace }: { readonly pace: ProviderPace }) {
  if (pace.kind === "deficit") {
    return <span className="text-destructive">{-pace.delta}% over pace</span>;
  }
  if (pace.kind === "reserve") {
    return <span className="text-success">{pace.delta}% under pace</span>;
  }
  return <span className="text-muted-foreground">On pace</span>;
}

function ProjectionLabel({ projection }: { readonly projection: WeeklyProjection }) {
  if (projection.kind === "runsOut") {
    return (
      <span className="text-destructive">
        {projection.inMs > 0 ? `Runs out in ${formatDuration(projection.inMs)}` : "Ran out"}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground">
      {projection.estimated ? "~" : ""}
      {projection.percent}% left at reset
    </span>
  );
}

function WindowRow({
  window,
  now,
}: {
  readonly window: ServerProviderUsageWindow;
  readonly now: number;
}) {
  const left = remainingPercent(window);
  const resetsAt = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;
  return (
    <div className="grid h-5 grid-cols-[minmax(0,1fr)_3rem_2.25rem_3.25rem] items-center gap-x-2">
      <span className="truncate text-muted-foreground">{window.label}</span>
      <PaceBar left={left} pace={providerPace(window, now)} />
      <span className="text-end">{left}%</span>
      <span className="text-end whitespace-nowrap text-muted-foreground">
        {resetsAt > now ? formatDuration(resetsAt - now) : null}
      </span>
    </div>
  );
}
