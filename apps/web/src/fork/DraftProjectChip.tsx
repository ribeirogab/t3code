import { ChevronDownIcon } from "lucide-react";

import { ComposerControl } from "~/components/chat/ComposerControl";
import { ComposerContextLabel } from "~/components/ComposerContextLabel";
import { ProjectFavicon } from "~/components/ProjectFavicon";
import type { Project } from "~/types";
import { useDraftProjectPickerOpener } from "./useDraftProjectPicker";

export function DraftProjectChip(props: {
  readonly project: Project;
  readonly isServerThread: boolean;
}) {
  const openPicker = useDraftProjectPickerOpener(props.isServerThread);
  if (!openPicker) return null;
  const label = props.project.isScratch ? "No project" : props.project.title;
  return (
    <div className="flex min-w-0 items-center">
      <ComposerControl
        size="xs"
        className="min-w-0 max-w-full"
        aria-haspopup="dialog"
        aria-label="Choose project"
        data-composer-context-control
        onClick={openPicker}
      >
        <ProjectFavicon project={props.project} className="size-3" />
        <ComposerContextLabel>{label}</ComposerContextLabel>
        <ChevronDownIcon aria-hidden="true" className="size-3" data-composer-control-chevron />
      </ComposerControl>
    </div>
  );
}
