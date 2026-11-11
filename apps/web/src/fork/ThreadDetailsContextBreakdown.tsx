import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import {
  type EnvironmentId,
  ForkContextUsageError,
  type ForkContextUsage,
  type ForkContextUsageCategory,
  type ForkContextUsageGroup,
  type ProviderInstanceId,
  type ServerProvider,
  type ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { ThreadDetailsContext } from "~/components/chat/ThreadDetailsUsage";
import { formatContextWindowTokens } from "~/lib/contextWindow";
import { cn } from "~/lib/utils";
import { useEnvironmentQuery } from "~/state/query";

import { useContextBreakdownStore } from "./contextBreakdownStore";
import { forkContextUsageQuery } from "./contextUsageQuery";
import { useForkFeature } from "./forkFeatures";

const CLAUDE_DRIVER = "claudeAgent";
const isForkContextUsageError = Schema.is(ForkContextUsageError);

const CATEGORY_SWATCH: Record<string, string> = {
  messages: "bg-blue-500",
  mcp_tools: "bg-orange-500",
  system_tools: "bg-emerald-500",
  system_prompt: "bg-amber-500",
};

function swatchClassName(category: ForkContextUsageCategory): string {
  if (category.kind === "free") return "ring-1 ring-inset ring-border";
  if (category.kind === "buffer") return "bg-muted-foreground/40";
  if (category.kind === "deferred") return "bg-muted-foreground/25";
  return CATEGORY_SWATCH[category.id] ?? "bg-muted-foreground/70";
}

function percentOf(tokens: number, maxTokens: number): string {
  return maxTokens > 0 ? `${((tokens / maxTokens) * 100).toFixed(1)}%` : "";
}

export function ForkThreadDetailsContext(props: {
  readonly contextWindow: ContextWindowSnapshot;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly providerInstanceId: ProviderInstanceId | null;
  readonly providers: readonly ServerProvider[];
}) {
  const enabled = useForkFeature("contextBreakdown");
  const expanded = useContextBreakdownStore((state) => state.expanded);
  const setExpanded = useContextBreakdownStore((state) => state.setExpanded);
  const driver = props.providers.find(
    (provider) => provider.instanceId === props.providerInstanceId,
  )?.driver;
  if (!enabled || props.threadId === null || driver !== CLAUDE_DRIVER) {
    return <ThreadDetailsContext usage={props.contextWindow} />;
  }
  return (
    <ThreadDetailsContext
      usage={props.contextWindow}
      disclosure={{
        expanded,
        onToggle: () => setExpanded(!expanded),
        content: (
          <ContextBreakdown
            environmentId={props.environmentId}
            threadId={props.threadId}
            revision={props.contextWindow.usedTokens}
          />
        ),
      }}
    />
  );
}

function ContextBreakdown(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly revision: number;
}) {
  const query = useEnvironmentQuery(
    forkContextUsageQuery({
      environmentId: props.environmentId,
      input: { threadId: props.threadId, revision: props.revision },
    }),
  );
  const [shown, setShown] = useState<ForkContextUsage | null>(null);
  if (query.data !== null && query.data !== shown) setShown(query.data);
  const usage = query.data ?? shown;
  if (usage === null) {
    const stopped =
      isForkContextUsageError(query.failure) && query.failure.reason === "session-stopped";
    return (
      <p className="col-span-3 px-2.5 pt-1 pb-1.5 text-muted-foreground text-xs">
        {stopped ? "Available after the next turn." : (query.error ?? "Loading…")}
      </p>
    );
  }
  const inWindow = usage.categories.filter(
    (category) => category.kind !== "deferred" && category.tokens > 0,
  );
  const deferred = usage.categories.filter(
    (category) => category.kind === "deferred" && category.tokens > 0,
  );
  return (
    <div className="col-span-3 flex flex-col gap-2 px-2.5 pt-1 pb-1.5 text-xs">
      <div className="grid grid-cols-[0.5rem_minmax(0,1fr)_auto_2.75rem] items-center gap-x-2 gap-y-1 tabular-nums">
        {inWindow.map((category) => (
          <CategoryRow key={category.id} category={category} maxTokens={usage.maxTokens} />
        ))}
        {deferred.map((category) => (
          <CategoryRow key={category.id} category={category} maxTokens={null} />
        ))}
      </div>
      {usage.groups.length > 0 ? (
        <div className="flex flex-col">
          {usage.groups.map((group) => (
            <GroupRows key={group.id} group={group} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CategoryRow(props: {
  readonly category: ForkContextUsageCategory;
  readonly maxTokens: number | null;
}) {
  const deferred = props.maxTokens === null;
  return (
    <>
      <span className={cn("size-2 rounded-xs", swatchClassName(props.category))} />
      <span className={cn("truncate text-muted-foreground", deferred && "opacity-60")}>
        {props.category.name}
      </span>
      <span className={cn("text-end text-muted-foreground", deferred && "opacity-60")}>
        {formatContextWindowTokens(props.category.tokens)}
      </span>
      <span className={cn("text-end", deferred && "text-muted-foreground opacity-60")}>
        {props.maxTokens === null ? null : percentOf(props.category.tokens, props.maxTokens)}
      </span>
    </>
  );
}

function GroupRows(props: { readonly group: ForkContextUsageGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="-mx-1 flex h-6 items-center gap-1 rounded-md px-1 text-muted-foreground outline-none hover:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-white/[0.08]"
      >
        <ChevronRightIcon
          aria-hidden
          className={cn(
            "size-3 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
        <span className="truncate">{props.group.name}</span>
        <span className="ml-auto tabular-nums">{props.group.count}</span>
      </button>
      {open && props.group.entries.length > 0 ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 pb-1 pl-4 text-muted-foreground tabular-nums">
          {props.group.entries.map((entry) => (
            <GroupEntry key={entry.name} name={entry.name} tokens={entry.tokens} />
          ))}
        </div>
      ) : null}
    </>
  );
}

function GroupEntry(props: { readonly name: string; readonly tokens: number }) {
  return (
    <>
      <span className="truncate">{props.name}</span>
      <span className="text-end">{formatContextWindowTokens(props.tokens)}</span>
    </>
  );
}
