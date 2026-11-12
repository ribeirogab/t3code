import type { ScopedThreadRef } from "@t3tools/contracts";

import { Badge } from "~/components/ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useQuietThreadShells, useThreadShell } from "~/state/entities";

import { useForkFeature } from "./forkFeatures";
import { sharedWorktreeLabel, threadsSharingWorktree } from "./sharedWorktree";

export function ThreadHeaderSharedWorktree({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  const enabled = useForkFeature("sharedWorktree");
  const self = useThreadShell(enabled ? threadRef : null);
  const shells = useQuietThreadShells();
  const sharing = self === null ? [] : threadsSharingWorktree(self, shells);
  if (sharing.length === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant="warning" size="sm" />}>
        {sharedWorktreeLabel(sharing.length)}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{sharing.map((thread) => thread.title).join(", ")}</TooltipPopup>
    </Tooltip>
  );
}
