import { assert, describe, it } from "@effect/vitest";
import { OrchestratorMcpFailure, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import {
  delegatedTaskThreadId,
  type KnownThread,
  resolveThreadId,
  resolvingThreadIds,
  type ThreadLookup,
} from "./threadIdResolver.ts";

const COMMAND = "mcp:11111111-2222-3333-4444-555555555555:delegate-task:fix-login";
const STORED = `thread:delegated-task:${encodeURIComponent(COMMAND)}`;
const LAUNCHED = "mcp:launch:0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0";

function lookupOf(threads: Record<string, KnownThread>) {
  const asked: Array<string> = [];
  const lookup: ThreadLookup = (threadId) =>
    Effect.sync(() => {
      asked.push(threadId);
      return threads[threadId] ?? null;
    });
  return { lookup, asked };
}

const live: KnownThread = { deletedAt: null };

describe("delegatedTaskThreadId", () => {
  it.each([
    ["a decoded delegated thread id", `thread:delegated-task:${COMMAND}`, STORED],
    ["a delegated task id", `node:delegated-task:${encodeURIComponent(COMMAND)}`, STORED],
    ["a decoded delegated task id", `node:delegated-task:${COMMAND}`, STORED],
    ["a fully encoded thread id", encodeURIComponent(STORED), STORED],
    ["the stored id", STORED, null],
    ["a launched thread id", LAUNCHED, null],
    ["an MCP thread id", "mcp:11111111-2222-3333-4444-555555555555", null],
  ] as const)("%s", (_name, requested, expected) => {
    assert.strictEqual(delegatedTaskThreadId(requested), expected);
  });
});

describe("resolveThreadId", () => {
  it.effect("maps a decoded delegated id to the stored one", () =>
    Effect.gen(function* () {
      const { lookup } = lookupOf({ [STORED]: live });
      assert.strictEqual(
        yield* resolveThreadId(lookup, `thread:delegated-task:${COMMAND}`),
        STORED,
      );
    }),
  );

  it.effect("keeps an id that names a thread, and one no candidate matches", () =>
    Effect.gen(function* () {
      const decoded = `thread:delegated-task:${COMMAND}`;
      const both = lookupOf({ [decoded]: live, [STORED]: live });
      assert.strictEqual(yield* resolveThreadId(both.lookup, decoded), decoded);
      const none = lookupOf({});
      assert.strictEqual(yield* resolveThreadId(none.lookup, decoded), decoded);
    }),
  );

  it.effect("reads nothing for an id that has no other spelling", () =>
    Effect.gen(function* () {
      const { lookup, asked } = lookupOf({ [LAUNCHED]: live });
      assert.strictEqual(yield* resolveThreadId(lookup, LAUNCHED), LAUNCHED);
      assert.deepEqual(asked, []);
    }),
  );
});

describe("resolvingThreadIds", () => {
  const notFound = (threadId: string) =>
    new OrchestratorMcpFailure({
      code: "thread_not_found",
      message: `Thread ${threadId} was not found.`,
    });

  it.effect("gives the handler the stored id in every thread id field", () =>
    Effect.gen(function* () {
      const { lookup } = lookupOf({ [STORED]: live });
      const seen = yield* resolvingThreadIds(lookup, (params: Record<string, string>) =>
        Effect.succeed(params),
      )({
        threadId: `thread:delegated-task:${COMMAND}`,
        childThreadId: `node:delegated-task:${COMMAND}`,
        view: "messages",
      });
      assert.deepEqual(seen, { threadId: STORED, childThreadId: STORED, view: "messages" });
    }),
  );

  it.effect("says a deleted thread was deleted", () =>
    Effect.gen(function* () {
      const deletedAt = DateTime.makeUnsafe("2026-11-06T23:37:58.520Z");
      const { lookup } = lookupOf({ [LAUNCHED]: { deletedAt } });
      const failure = yield* resolvingThreadIds(lookup, (params: { threadId: string }) =>
        Effect.fail(notFound(params.threadId)),
      )({ threadId: LAUNCHED }).pipe(Effect.flip);
      assert.strictEqual(failure.code, "thread_not_found");
      assert.include(failure.message, "was deleted at 2026-11-06T23:37:58.520Z");
    }),
  );

  it.effect("leaves other failures as they are", () =>
    Effect.gen(function* () {
      const { lookup } = lookupOf({});
      const missing = yield* resolvingThreadIds(lookup, (params: { threadId: string }) =>
        Effect.fail(notFound(params.threadId)),
      )({ threadId: LAUNCHED }).pipe(Effect.flip);
      assert.strictEqual(missing.message, `Thread ${LAUNCHED} was not found.`);
      const busy = new OrchestratorMcpFailure({
        code: "thread_not_interruptible",
        message: "Busy.",
      });
      const other = yield* resolvingThreadIds(lookupOf({ [LAUNCHED]: live }).lookup, () =>
        Effect.fail(busy),
      )({ threadId: ThreadId.make(LAUNCHED) }).pipe(Effect.flip);
      assert.strictEqual(other, busy);
    }),
  );
});
