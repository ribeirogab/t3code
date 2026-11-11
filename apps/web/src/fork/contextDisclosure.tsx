import { ChevronRightIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

import { cn } from "~/lib/utils";

export interface ContextDisclosure {
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly content: ReactNode;
}

export function disclosureTriggerProps(disclosure: ContextDisclosure | undefined) {
  if (disclosure === undefined) return {};
  return {
    "aria-expanded": disclosure.expanded,
    onClick: disclosure.onToggle,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      disclosure.onToggle();
    },
    style: { cursor: "pointer" },
  };
}

export function DisclosureChevron(props: { readonly disclosure: ContextDisclosure | undefined }) {
  if (props.disclosure === undefined) return null;
  return (
    <ChevronRightIcon
      aria-hidden
      className={cn(
        "ml-0.5 inline size-3 align-[-2px] transition-transform motion-reduce:transition-none",
        props.disclosure.expanded && "rotate-90",
      )}
    />
  );
}
