import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { ChevronDownIcon } from "lucide-react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { hasUnseenCompletion, resolveThreadLastVisitedAt } from "~/components/Sidebar.logic";
import { cn } from "~/lib/utils";
import { useUiStateStore } from "~/uiStateStore";

import { nestingThreadKey, type NestedGuide } from "./sidebarNesting";

export interface SidebarRowNesting {
  readonly indent: number;
  readonly baseInset: number;
  readonly guides: readonly NestedGuide[];
  readonly descendantCount: number;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}

const GUIDE_BASE_PX = 17;
const STEP_PX = 16;
const ROW_INSET_PX = 10;
const CARD_STEM_TOP_PX = 49;
const SLIM_STEM_TOP_PX = 27;
const NESTED_STEM_TOP_PX = 25;

export const nestedListItemClassName = "relative [content-visibility:visible]";

const guideLine = "pointer-events-none absolute z-20 w-0 border-l border-sidebar-foreground/15";
const elbowLine =
  "after:absolute after:-left-px after:w-[7px] after:border-t after:border-sidebar-foreground/15 after:content-['']";

function guideLeft(nesting: Pick<SidebarRowNesting, "baseInset">, level: number): number {
  return nesting.baseInset + GUIDE_BASE_PX + (level - 1) * STEP_PX;
}

function nestedPaddingPx(nesting: Pick<SidebarRowNesting, "baseInset" | "indent">): number {
  return nesting.baseInset + ROW_INSET_PX + nesting.indent * STEP_PX;
}

export function nestedRowStyle(nesting: SidebarRowNesting | undefined): CSSProperties | undefined {
  return nesting === undefined || nesting.indent === 0
    ? undefined
    : { paddingInlineStart: nestedPaddingPx(nesting) };
}

export function nestedRowClassName(nesting: SidebarRowNesting | undefined): string | false {
  return nesting !== undefined && nesting.indent > 0 && "h-8";
}

function GuideLines(props: {
  readonly nesting: Pick<SidebarRowNesting, "baseInset">;
  readonly guides: readonly NestedGuide[];
}): ReactNode {
  return props.guides.map((guide) => (
    <span
      key={`${guide.level}:${guide.elbow}`}
      aria-hidden
      className={cn(
        guideLine,
        "-top-px",
        guide.end ? "bottom-1/2" : "-bottom-px",
        guide.elbow && elbowLine,
        guide.elbow && (guide.end ? "after:bottom-0" : "after:top-1/2"),
      )}
      style={{ left: guideLeft(props.nesting, guide.level) }}
    />
  ));
}

export function NestedRowGuides(props: {
  readonly nesting: SidebarRowNesting;
  readonly card: boolean;
}): ReactNode {
  const { nesting } = props;
  const stem = nesting.descendantCount > 0 && nesting.indent < 3;
  const stemTop = props.card
    ? CARD_STEM_TOP_PX
    : nesting.indent > 0
      ? NESTED_STEM_TOP_PX
      : SLIM_STEM_TOP_PX;
  return (
    <>
      <GuideLines nesting={nesting} guides={nesting.guides} />
      {stem ? (
        <span
          aria-hidden
          className={cn(guideLine, "-bottom-px")}
          style={{ left: guideLeft(nesting, nesting.indent + 1), top: stemTop }}
        />
      ) : null}
    </>
  );
}

export function NestedDisclosure(props: {
  readonly nesting: SidebarRowNesting | undefined;
}): ReactNode {
  const { nesting } = props;
  if (nesting === undefined || nesting.descendantCount === 0) return null;
  const label = `${nesting.collapsed ? "Show" : "Minimize"} nested threads`;
  const toggle = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    nesting.onToggle();
  };
  return (
    <button
      type="button"
      aria-expanded={!nesting.collapsed}
      aria-label={label}
      onClick={toggle}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className="pointer-events-auto relative z-10 -me-1 inline-flex h-[18px] shrink-0 cursor-pointer items-center gap-0.75 rounded-sm px-1 text-xs tabular-nums text-sidebar-muted-foreground outline-none hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {nesting.descendantCount}
      <ChevronDownIcon
        aria-hidden
        className={cn("size-3 transition-transform", nesting.collapsed && "-rotate-90")}
      />
    </button>
  );
}

function useUnreadCount(threads: readonly EnvironmentThreadShell[]): number {
  const lastVisitedById = useUiStateStore((state) => state.threadLastVisitedAtById);
  return threads.filter((thread) =>
    hasUnseenCompletion({
      ...thread,
      lastVisitedAt: resolveThreadLastVisitedAt(
        thread.lastVisitedAt,
        lastVisitedById[nestingThreadKey(thread)],
      ),
    }),
  ).length;
}

export function NestedSummaryRow(props: {
  readonly parentKey: string;
  readonly indent: number;
  readonly baseInset: number;
  readonly guides: readonly NestedGuide[];
  readonly threads: readonly EnvironmentThreadShell[];
  readonly onOpen: () => void;
}): ReactNode {
  const unread = useUnreadCount(props.threads);
  const count = props.threads.length;
  return (
    <li className={cn("list-none", nestedListItemClassName)}>
      <button
        type="button"
        data-sidebar-row={`${props.parentKey}:nested-summary`}
        data-sidebar-parent={props.parentKey}
        onClick={props.onOpen}
        className="flex h-7 w-full cursor-pointer items-center gap-1 rounded-md text-left text-xs text-sidebar-muted-foreground outline-none hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        style={{ paddingInlineStart: nestedPaddingPx(props) }}
      >
        <span className="truncate">
          {count} nested {count === 1 ? "thread" : "threads"}
        </span>
        {unread > 0 ? (
          <span className="shrink-0 text-info-foreground">· {unread} unread</span>
        ) : null}
      </button>
      <GuideLines nesting={props} guides={props.guides} />
    </li>
  );
}
