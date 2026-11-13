import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import {
  parkedThreadHasOpenRequest,
  resolveParkedPlacement,
  type ParkedThreadShell,
} from "./parkedThreads.logic";

const environmentId = EnvironmentId.make("env");
const threadId = ThreadId.make("thread");
const parkedKeys = new Set([scopedThreadKey(scopeThreadRef(environmentId, threadId))]);

function shell(overrides: Partial<ParkedThreadShell> = {}): ParkedThreadShell {
  return {
    environmentId,
    id: threadId,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pendingUserInputAt: null,
    pendingSubagentRequest: null,
    pendingGuestMessageCount: 0,
    latestRun: null,
    lastVisitedAt: "2026-11-13T10:00:00.000Z",
    updatedAt: "2026-11-13T09:00:00.000Z",
    source: { pendingRuntimeRequest: null },
    ...overrides,
  };
}

function approvalAt(createdAt: string): Partial<ParkedThreadShell> {
  return {
    hasPendingApprovals: true,
    source: {
      pendingRuntimeRequest: {
        id: RuntimeRequestId.make("request"),
        kind: "command",
        createdAt: DateTime.makeUnsafe(createdAt),
      },
    },
  };
}

function failedRunAt(completedAt: string) {
  return { status: "failed", completedAt } as unknown as ParkedThreadShell["latestRun"];
}

function withoutVisitTracking(thread: ParkedThreadShell): ParkedThreadShell {
  const { lastVisitedAt: _lastVisitedAt, ...rest } = thread;
  return rest;
}

const placementCases: ReadonlyArray<{
  readonly name: string;
  readonly thread: ParkedThreadShell;
  readonly keys: ReadonlySet<string> | null;
  readonly expected: "parked" | "surfaced" | null;
}> = [
  { name: "an unparked thread", thread: shell(), keys: new Set(), expected: null },
  { name: "a parked thread with the feature off", thread: shell(), keys: null, expected: null },
  { name: "an idle parked thread", thread: shell(), keys: parkedKeys, expected: "parked" },
  {
    name: "a parked thread asking for approval after the last visit",
    thread: shell(approvalAt("2026-11-13T11:00:00.000Z")),
    keys: parkedKeys,
    expected: "surfaced",
  },
  {
    name: "a parked thread whose open approval the user already saw",
    thread: shell(approvalAt("2026-11-13T09:30:00.000Z")),
    keys: parkedKeys,
    expected: "parked",
  },
  {
    name: "a parked thread with a question that has no request time",
    thread: shell({ hasPendingUserInput: true, updatedAt: "2026-11-13T11:00:00.000Z" }),
    keys: parkedKeys,
    expected: "surfaced",
  },
  {
    name: "a parked thread whose run failed after the last visit",
    thread: shell({ latestRun: failedRunAt("2026-11-13T11:00:00.000Z") }),
    keys: parkedKeys,
    expected: "surfaced",
  },
  {
    name: "a parked thread whose failure the user already saw",
    thread: shell({ latestRun: failedRunAt("2026-11-12T11:00:00.000Z") }),
    keys: parkedKeys,
    expected: "parked",
  },
  {
    name: "a parked thread asking on a server without visit tracking",
    thread: withoutVisitTracking(shell(approvalAt("2026-11-13T09:30:00.000Z"))),
    keys: parkedKeys,
    expected: "surfaced",
  },
];

describe("resolveParkedPlacement", () => {
  it.each(placementCases)("places $name", ({ thread, keys, expected }) => {
    expect(resolveParkedPlacement(thread, keys)).toBe(expected);
  });
});

describe("parkedThreadHasOpenRequest", () => {
  it("counts requests for the user but not an old failure", () => {
    expect(parkedThreadHasOpenRequest(shell(approvalAt("2026-11-13T09:30:00.000Z")))).toBe(true);
    expect(parkedThreadHasOpenRequest(shell({ pendingGuestMessageCount: 1 }))).toBe(true);
    expect(
      parkedThreadHasOpenRequest(shell({ latestRun: failedRunAt("2026-11-13T11:00:00.000Z") })),
    ).toBe(false);
  });
});
