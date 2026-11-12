import { CommandId, OrchestratorMcpFailure, ThreadId } from "@t3tools/contracts";
import { derive } from "@t3tools/provider-core/server/IdAllocator";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";

const THREAD_ID_FIELDS = [
  "threadId",
  "parentThreadId",
  "childThreadId",
  "sourceThreadId",
  "targetThreadId",
] as const;
const DELEGATED_TASK_PREFIXES = ["thread:delegated-task:", "node:delegated-task:"] as const;
const ENCODED_PREFIX = /^(thread|node)%3A/i;

export interface KnownThread {
  readonly deletedAt: DateTime.Utc | null;
}

export type ThreadLookup = (threadId: ThreadId) => Effect.Effect<KnownThread | null>;

const isFailure = Schema.is(OrchestratorMcpFailure);

function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export function delegatedTaskThreadId(requested: string): ThreadId | null {
  const text = ENCODED_PREFIX.test(requested) ? decoded(requested) : requested;
  const prefix = DELEGATED_TASK_PREFIXES.find((candidate) => text.startsWith(candidate));
  if (prefix === undefined) return null;
  const commandId = CommandId.make(decoded(text.slice(prefix.length)));
  const threadId = derive.delegatedTaskThread({ commandId });
  return threadId === requested ? null : threadId;
}

export const resolveThreadId = Effect.fn("ThreadIdResolver.resolveThreadId")(function* (
  lookup: ThreadLookup,
  requested: string,
) {
  const candidate = delegatedTaskThreadId(requested);
  if (candidate === null) return requested;
  if ((yield* lookup(ThreadId.make(requested))) !== null) return requested;
  return (yield* lookup(candidate)) === null ? requested : candidate;
});

const resolveThreadIdFields = Effect.fn("ThreadIdResolver.resolveThreadIdFields")(function* <P>(
  lookup: ThreadLookup,
  params: P,
) {
  if (!Predicate.isObject(params)) return params;
  const changed: Record<string, string> = {};
  for (const field of THREAD_ID_FIELDS) {
    const requested: unknown = params[field];
    if (typeof requested !== "string") continue;
    const threadId = yield* resolveThreadId(lookup, requested);
    if (threadId !== requested) changed[field] = threadId;
  }
  return (Object.keys(changed).length === 0 ? params : { ...params, ...changed }) as P;
});

const deletedThreadFailure = Effect.fn("ThreadIdResolver.deletedThreadFailure")(function* (
  lookup: ThreadLookup,
  params: unknown,
  failure: OrchestratorMcpFailure,
) {
  const threadId = Predicate.isObject(params) ? params.threadId : undefined;
  if (typeof threadId !== "string") return failure;
  const thread = yield* lookup(ThreadId.make(threadId));
  if (thread === null || thread.deletedAt === null) return failure;
  return new OrchestratorMcpFailure({
    code: "thread_not_found",
    message: `Thread ${threadId} was deleted at ${DateTime.formatIso(thread.deletedAt)}. The id is right; the thread is gone, so do not retry with another id.`,
  });
});

export function resolvingThreadIds<P, A, E, R>(
  lookup: ThreadLookup,
  handler: (params: P) => Effect.Effect<A, E, R>,
) {
  return (params: P) =>
    resolveThreadIdFields(lookup, params).pipe(
      Effect.flatMap((resolved) =>
        handler(resolved).pipe(
          Effect.catchIf(
            (error): error is E & OrchestratorMcpFailure =>
              isFailure(error) && error.code === "thread_not_found",
            (failure) =>
              deletedThreadFailure(lookup, resolved, failure).pipe(Effect.flatMap(Effect.fail)),
          ),
        ),
      ),
    );
}

const lookupOf =
  (threads: ThreadManagement.ThreadManagementService["Service"]): ThreadLookup =>
  (threadId) =>
    threads.getThreadShell(threadId).pipe(Effect.orElseSucceed(() => null));

type ToolHandler = (params: object) => Effect.Effect<unknown, OrchestratorMcpFailure>;

const resolvingHandler =
  (handler: ToolHandler): ToolHandler =>
  (params) =>
    Effect.serviceOption(ThreadManagement.ThreadManagementService).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => handler(params),
          onSome: (threads) => resolvingThreadIds(lookupOf(threads), handler)(params),
        }),
      ),
    );

export function withThreadIdResolution<Handlers extends object>(handlers: Handlers): Handlers {
  return Object.fromEntries(
    Object.entries(handlers).map(([name, handler]: [string, unknown]) => [
      name,
      Predicate.isFunction(handler) ? resolvingHandler(handler as ToolHandler) : handler,
    ]),
  ) as Handlers;
}
