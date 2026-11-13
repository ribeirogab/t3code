import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { ContextMenuItem } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

export type ParkedThreadMenuId = "park" | "unpark";

export type ParkedThreadShell = Pick<
  EnvironmentThreadShell,
  | "environmentId"
  | "id"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "pendingUserInputAt"
  | "pendingSubagentRequest"
  | "pendingGuestMessageCount"
  | "latestRun"
  | "lastVisitedAt"
  | "updatedAt"
> & {
  readonly source: Pick<EnvironmentThreadShell["source"], "pendingRuntimeRequest">;
};

function openRequestAt(thread: ParkedThreadShell): number | null {
  const request = thread.source.pendingRuntimeRequest;
  if (request != null) return DateTime.toEpochMillis(request.createdAt);
  if (thread.hasPendingUserInput && thread.pendingUserInputAt) {
    return Date.parse(thread.pendingUserInputAt);
  }
  const waiting =
    thread.hasPendingApprovals ||
    thread.hasPendingUserInput ||
    thread.pendingSubagentRequest != null ||
    (thread.pendingGuestMessageCount ?? 0) > 0;
  return waiting ? Date.parse(thread.updatedAt) : null;
}

function attentionAt(thread: ParkedThreadShell): number | null {
  const requestAt = openRequestAt(thread);
  if (requestAt !== null) return requestAt;
  if (thread.latestRun?.status !== "failed") return null;
  return Date.parse(thread.latestRun.completedAt ?? thread.updatedAt);
}

export function parkedThreadHasOpenRequest(thread: ParkedThreadShell): boolean {
  return openRequestAt(thread) !== null;
}

/** A parked thread that asks for the user returns to Active until the user opens it. */
export function resolveParkedPlacement(
  thread: ParkedThreadShell,
  parkedKeys: ReadonlySet<string> | null,
): "parked" | "surfaced" | null {
  if (!parkedKeys?.has(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)))) {
    return null;
  }
  const askedAt = attentionAt(thread);
  if (askedAt === null) return "parked";
  const visitedAt = thread.lastVisitedAt ? Date.parse(thread.lastVisitedAt) : Number.NaN;
  return visitedAt >= askedAt ? "parked" : "surfaced";
}

export function parkedThreadMenuItems(
  parked: boolean | null | undefined,
): ReadonlyArray<ContextMenuItem<ParkedThreadMenuId>> {
  if (parked == null) return [];
  return [
    parked
      ? { id: "unpark", label: "Unpark thread", icon: "square-parking" }
      : { id: "park", label: "Park thread", icon: "square-parking" },
  ];
}

export function parkedThreadMenuTarget(action: string): boolean | null {
  return action === "park" ? true : action === "unpark" ? false : null;
}
