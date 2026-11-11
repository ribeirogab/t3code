import { resolveThreadProviderStack } from "@t3tools/client-runtime/state/models";

import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import type { SidebarProviderEntry } from "~/components/sidebar/SidebarThreadRow";
import { shouldShowInstanceBadge } from "~/providerInstances";
import type { SidebarThreadSummary } from "~/types";

export function SidebarTitleProviderIcon(props: {
  readonly thread: SidebarThreadSummary;
  readonly providerEntryByInstanceId: ReadonlyMap<string, SidebarProviderEntry>;
}) {
  const stack = resolveThreadProviderStack(props.thread);
  const entry = props.providerEntryByInstanceId.get(stack[stack.length - 1]!);
  if (entry === undefined) return null;
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center">
      <ProviderInstanceIcon
        driverKind={entry.driverKind}
        displayName={entry.displayName}
        accentColor={entry.accentColor}
        acpRegistryAgentId={entry.acpRegistryAgentId}
        acpRegistryIconUrl={entry.acpRegistryIconUrl}
        showBadge={shouldShowInstanceBadge(entry, props.providerEntryByInstanceId.values())}
        size="compact"
      />
    </span>
  );
}
