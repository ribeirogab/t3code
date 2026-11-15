import { assert, describe, it } from "@effect/vitest";
import { overrideForkFeatureSettings } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { McpSchema } from "effect/ai";

import { followForkToolListing } from "./forkToolListing.ts";

const UPSTREAM_DELEGATE =
  "Start one child agent with only `task`. No parent history. Separate checkout or PR per child: `isolation:'worktree'`. Keep `taskId` for `task_status` and `task_cancel`. No secrets in `task`.";
const FORK_DELEGATE =
  "Start one child agent with only `task`. No parent history. Separate checkout or PR per child: `isolation:'worktree'`. A thread the user asked for gets a sidebar row: `listed:true`. `notifyParent` limits which child events wake you. Keep `taskId` for `task_status` and `task_cancel`. No secrets in `task`.";
const UPSTREAM_UPDATE =
  "Rename a thread (`action:'rename'` with `title`) or regenerate its title. Omit `threadId` for this thread.";
const FORK_UPDATE =
  "Rename a thread (`action:'rename'` with `title`), regenerate its title, or show or hide a child thread in the sidebar when the user asks (`action:'set_listed'` with `listed`). Omit `threadId` for this thread.";

const string = { type: "string" };
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const actions = { type: "string", enum: ["rename", "regenerate_title", "set_listed"] };

const registered = [
  new McpSchema.Tool({
    name: "delegate_task",
    description: UPSTREAM_DELEGATE,
    inputSchema: {
      type: "object",
      properties: {
        task: string,
        listed: { type: "boolean" },
        notifyParent: { type: "string", enum: ["on_finish", "never"] },
        ownerFacing: { type: "boolean" },
        goal: string,
      },
      required: ["task"],
    },
  }),
  new McpSchema.Tool({
    name: "t3_thread_update",
    description: UPSTREAM_UPDATE,
    inputSchema: {
      type: "object",
      properties: { action: actions, title: string, listed: { type: "boolean" } },
      required: ["action"],
    },
    outputSchema: { type: "object", properties: { action: actions }, required: ["action"] },
  }),
  new McpSchema.Tool({
    name: "t3_thread_send",
    description: "Send a message to any thread.",
    inputSchema: { type: "object", properties: { threadId: string, wake: { type: "boolean" } } },
    outputSchema: {
      type: "object",
      properties: {
        threadId: string,
        runId: nullable(string),
        delivery: { type: "string", enum: ["started", "held"] },
      },
      required: ["threadId", "delivery"],
    },
  }),
  new McpSchema.Tool({
    name: "t3_thread_organize",
    description: "Archive a thread.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      anyOf: [
        { type: "object", properties: { sequence: string }, required: ["sequence"] },
        {
          type: "object",
          properties: { archivesWhenTurnEnds: { type: "boolean", enum: [true] } },
          required: ["archivesWhenTurnEnds"],
        },
      ],
    },
  }),
  new McpSchema.Tool({
    name: "t3_thread_read",
    description: "Read a thread.",
    inputSchema: { type: "object", properties: { threadId: string } },
  }),
];

const handle = () => Effect.die("not called");

const followListing = Effect.gen(function* () {
  const tools = registered.map((tool) => ({ tool, annotations: Context.empty(), handle }));
  const registrations: Array<string> = [];
  yield* followForkToolListing(tools, (registration) =>
    Effect.sync(() => {
      assert.strictEqual(registration.handle, handle);
      registrations.push(registration.tool.name);
      const index = tools.findIndex(({ tool }) => tool.name === registration.tool.name);
      tools[index] = { ...registration, handle };
    }),
  );
  const tool = (name: string) => {
    const entry = tools.find((candidate) => candidate.tool.name === name);
    assert.isDefined(entry);
    return entry;
  };
  return { tool, registrations };
});

const properties = (schema: unknown) =>
  (schema as { readonly properties: Readonly<Record<string, { readonly enum?: unknown }>> })
    .properties;

describe("followForkToolListing", () => {
  it.effect("lists the upstream definitions while Fork features is off", () =>
    Effect.gen(function* () {
      using _settings = overrideForkFeatureSettings({ master: false });
      const { tool } = yield* followListing;
      const delegate = tool("delegate_task").tool;
      assert.strictEqual(delegate.description, UPSTREAM_DELEGATE);
      assert.deepEqual(Object.keys(properties(delegate.inputSchema)), ["task"]);
      const update = tool("t3_thread_update").tool;
      assert.strictEqual(update.description, UPSTREAM_UPDATE);
      assert.deepEqual(Object.keys(properties(update.inputSchema)), ["action", "title"]);
      assert.deepEqual(properties(update.inputSchema).action?.enum, ["rename", "regenerate_title"]);
      assert.deepEqual(properties(update.outputSchema).action?.enum, [
        "rename",
        "regenerate_title",
      ]);
      const send = tool("t3_thread_send").tool;
      assert.deepEqual(Object.keys(properties(send.inputSchema)), ["threadId"]);
      assert.deepEqual(send.outputSchema, {
        type: "object",
        properties: {
          threadId: string,
          runId: string,
          delivery: { type: "string", enum: ["started"] },
        },
        required: ["threadId", "runId", "delivery"],
      });
      assert.deepEqual(tool("t3_thread_organize").tool.outputSchema, {
        anyOf: [{ type: "object", properties: { sequence: string }, required: ["sequence"] }],
      });
    }),
  );

  it.effect("adds each fork part only while its feature is on", () =>
    Effect.gen(function* () {
      using _settings = overrideForkFeatureSettings({ features: { nestedThreads: false } });
      const { tool } = yield* followListing;
      const delegate = tool("delegate_task").tool;
      assert.strictEqual(
        delegate.description,
        "Start one child agent with only `task`. No parent history. Separate checkout or PR per child: `isolation:'worktree'`. `notifyParent` limits which child events wake you. Keep `taskId` for `task_status` and `task_cancel`. No secrets in `task`.",
      );
      assert.deepEqual(Object.keys(properties(delegate.inputSchema)), [
        "task",
        "notifyParent",
        "ownerFacing",
        "goal",
      ]);
      assert.property(properties(tool("t3_thread_send").tool.inputSchema), "wake");
    }),
  );

  it.effect("lists the definitions again when the settings change, with the same handlers", () =>
    Effect.gen(function* () {
      const { tool, registrations } = yield* followListing;
      assert.deepEqual(registrations, ["delegate_task", "t3_thread_update"]);
      assert.strictEqual(tool("delegate_task").tool.description, FORK_DELEGATE);
      assert.strictEqual(tool("t3_thread_update").tool.description, FORK_UPDATE);
      assert.deepEqual(tool("t3_thread_send").tool, registered[2]);
      {
        using _settings = overrideForkFeatureSettings({ master: false });
        assert.strictEqual(tool("t3_thread_update").tool.description, UPSTREAM_UPDATE);
        assert.notProperty(properties(tool("t3_thread_send").tool.inputSchema), "wake");
      }
      assert.strictEqual(tool("t3_thread_update").tool.description, FORK_UPDATE);
      assert.deepEqual(tool("t3_thread_send").tool, registered[2]);
      assert.notInclude(registrations, "t3_thread_read");
    }),
  );
});
