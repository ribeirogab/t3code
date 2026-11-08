import { scopeThreadRef } from "@t3tools/client-runtime/environment";

import {
  SidebarThreadRow,
  type SidebarThreadRowProps,
} from "~/components/sidebar/SidebarThreadRow";
import { useThreadShell } from "~/state/entities";

export function NestedThreadRow(props: Omit<SidebarThreadRowProps, "sortable">) {
  const thread =
    useThreadShell(scopeThreadRef(props.thread.environmentId, props.thread.id)) ?? props.thread;
  return <SidebarThreadRow key={props.variant} {...props} thread={thread} />;
}
