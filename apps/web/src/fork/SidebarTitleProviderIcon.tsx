import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import type { SidebarProviderEntry } from "~/components/sidebar/SidebarThreadRow";
import { shouldShowInstanceBadge } from "~/providerInstances";
import type { SidebarThreadSummary } from "~/types";

export function SidebarTitleProviderIcon(props: {
  readonly thread: SidebarThreadSummary;
  readonly providerEntryByInstanceId: ReadonlyMap<string, SidebarProviderEntry>;
}) {
  const entry = props.providerEntryByInstanceId.get(
    props.thread.runtime?.providerInstanceId ?? props.thread.modelSelection.instanceId,
  );
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
