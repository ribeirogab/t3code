import { HandIcon } from "lucide-react";

import { ComposerBanner } from "~/components/chat/ComposerBanner";
import { cn } from "~/lib/utils";

import { FORK_NEEDS_YOU_PILL } from "./goalStatus.logic";

export interface NeedsYouCardModel {
  readonly kind: "needsYou";
  readonly id: string;
  readonly summary: string;
}

export function NeedsYouComposerBanner({ banner }: { readonly banner: NeedsYouCardModel }) {
  return (
    <ComposerBanner.Attachment
      data-fork-needs-you="true"
      className="transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-none"
    >
      <ComposerBanner.Root density="comfortable">
        <ComposerBanner.Row>
          <ComposerBanner.Icon className={FORK_NEEDS_YOU_PILL.colorClass}>
            <HandIcon />
          </ComposerBanner.Icon>
          <ComposerBanner.Content className="gap-1.5 whitespace-nowrap">
            <span
              className={cn(
                "flex-none font-medium leading-7 sm:leading-6",
                FORK_NEEDS_YOU_PILL.colorClass,
              )}
            >
              {FORK_NEEDS_YOU_PILL.label}
            </span>
            <span className="w-0 min-w-0 grow truncate text-muted-foreground">
              {banner.summary}
            </span>
          </ComposerBanner.Content>
        </ComposerBanner.Row>
      </ComposerBanner.Root>
    </ComposerBanner.Attachment>
  );
}
