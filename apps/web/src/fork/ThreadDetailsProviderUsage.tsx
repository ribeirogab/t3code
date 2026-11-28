import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import type { ServerProvider, UsageLimitSourceSnapshots } from "@t3tools/contracts";
import { remainingPercent } from "@t3tools/shared/usageLimits";
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import { ThreadDetailsSection } from "~/components/chat/ThreadDetailsSection";
import { PreviewCard, PreviewCardPopup, PreviewCardTrigger } from "~/components/ui/preview-card";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";

import { useForkFeature } from "./forkFeatures";
import { PaceBar, ProviderUsageCard, providerUsageName } from "./ProviderUsageCard";
import {
  collectProviderUsageEntries,
  formatPaceDelta,
  providerPace,
  type ProviderUsageEntry,
} from "./providerUsagePace";
import { useProviderUsageStore } from "./providerUsageStore";

const ROW_HOVER =
  "rounded-lg outline-none hover:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-popup-open:bg-black/[0.035] dark:hover:bg-white/[0.08] dark:data-popup-open:bg-white/[0.08]";

type ProviderUsageCardHandle = PreviewCardPrimitive.Handle<string>;

export function ForkThreadDetailsProviderUsage(props: {
  readonly providers: readonly ServerProvider[];
  readonly sources: UsageLimitSourceSnapshots;
}) {
  const enabled = useForkFeature("providerUsage");
  const expanded = useProviderUsageStore((state) => state.expanded);
  const setExpanded = useProviderUsageStore((state) => state.setExpanded);
  const nowMinute = useNowMinute();
  const [card] = useState<ProviderUsageCardHandle>(() => PreviewCardPrimitive.createHandle());
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
              <ProviderRow key={entry.account.id} entry={entry} now={now} card={card} />
            ))}
          </div>
        ) : null}
        <PreviewCard handle={card}>
          {({ payload }) => {
            const entry = entries.find(({ account }) => account.id === payload);
            return entry ? (
              <PreviewCardPopup side="left" sideOffset={16} align="center" className="w-68">
                <ProviderUsageCard entry={entry} now={now} />
              </PreviewCardPopup>
            ) : null;
          }}
        </PreviewCard>
      </div>
    </ThreadDetailsSection>
  );
}

function ProviderRow({
  entry,
  now,
  card,
}: {
  readonly entry: ProviderUsageEntry;
  readonly now: number;
  readonly card: ProviderUsageCardHandle;
}) {
  const { account, weekly } = entry;
  const name = providerUsageName(account);
  const pace = providerPace(weekly, now);
  const left = remainingPercent(weekly);
  return (
    <PreviewCardTrigger
      handle={card}
      payload={account.id}
      delay={150}
      closeDelay={100}
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
    </PreviewCardTrigger>
  );
}
