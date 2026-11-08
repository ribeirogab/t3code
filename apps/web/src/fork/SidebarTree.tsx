import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { ComponentProps, ReactNode } from "react";

import { SortableThreadRow } from "~/components/sidebar/SidebarThreadRow";

import { NestedSummaryRow, type SidebarRowNesting } from "./NestedThreadRowParts";
import { NestedThreadRow } from "./NestedThreadRow";
import {
  nestedDescendants,
  nestedSidebarEntries,
  nestingThreadKey,
  type NestedSidebarEntry,
  type SidebarNesting,
} from "./sidebarNesting";

const FOLDER_BASE_INSET_PX = 26;

export type NestedSidebarThreadEntry = Extract<
  NestedSidebarEntry<EnvironmentThreadShell>,
  { kind: "thread" }
>;

export interface SidebarTree {
  readonly nesting: SidebarNesting<EnvironmentThreadShell>;
  readonly collapsedKeys: ReadonlySet<string>;
  readonly toggle: (threadKey: string) => void;
}

export function sidebarRowNesting(input: {
  readonly tree: SidebarTree;
  readonly threadKey: string;
  readonly entry: NestedSidebarThreadEntry | undefined;
  readonly inFolder: boolean;
}): SidebarRowNesting | undefined {
  const { tree, threadKey, entry } = input;
  const descendantCount =
    entry?.descendantCount ?? nestedDescendants(tree.nesting, threadKey).length;
  if (entry === undefined && descendantCount === 0) return undefined;
  return {
    indent: entry?.indent ?? 0,
    baseInset: input.inFolder ? FOLDER_BASE_INSET_PX : 0,
    guides: entry?.guides ?? [],
    descendantCount,
    collapsed: tree.collapsedKeys.has(threadKey),
    onToggle: () => tree.toggle(threadKey),
  };
}

export function SidebarTreeRow(
  props: ComponentProps<typeof SortableThreadRow> & {
    readonly nestedParentKey: string | undefined;
  },
) {
  const { nestedParentKey, sortableId, sortableDisabled, contextDrag, ...rowProps } = props;
  if (nestedParentKey === undefined) {
    return (
      <SortableThreadRow
        {...rowProps}
        sortableId={sortableId}
        sortableDisabled={sortableDisabled}
        contextDrag={contextDrag}
      />
    );
  }
  return (
    <NestedThreadRow
      {...rowProps}
      variant="folder"
      navigationParent={nestedParentKey}
      settlementSupported={false}
      snoozeSupported={false}
      pinningSupported={false}
      isPinned={false}
      dropVerb={null}
      dragOverPinned={false}
      snoozeWakeLabelText={null}
    />
  );
}

export function renderNestedSidebarRows(input: {
  readonly tree: SidebarTree;
  readonly root: EnvironmentThreadShell;
  readonly inFolder: boolean;
  readonly renderThread: (entry: NestedSidebarThreadEntry) => ReactNode;
  readonly onOpenParent: (parentKey: string) => void;
}): ReactNode[] {
  const { tree } = input;
  return nestedSidebarEntries(tree.nesting, nestingThreadKey(input.root), tree.collapsedKeys).map(
    (entry) =>
      entry.kind === "thread" ? (
        input.renderThread(entry)
      ) : (
        <NestedSummaryRow
          key={entry.key}
          parentKey={entry.parentKey}
          indent={entry.indent}
          baseInset={input.inFolder ? FOLDER_BASE_INSET_PX : 0}
          guides={entry.guides}
          threads={entry.threads}
          onOpen={() => input.onOpenParent(entry.parentKey)}
        />
      ),
  );
}
