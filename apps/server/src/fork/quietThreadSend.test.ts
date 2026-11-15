import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  OrchestratorMcpFailure,
  overrideForkFeatureSettings,
  ThreadId,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import { ThreadManagementNoSteerableRunError } from "../orchestration-v2/ThreadManagementService.ts";
import { withForkToolGates } from "./forkToolGates.ts";
import * as QuietThreadSend from "./quietThreadSend.ts";

const hubId = ThreadId.make("thread:hub");
const caseId = ThreadId.make("thread:case-5");
const scope = {
  thread: { threadId: caseId, providerInstanceId: "claudeAgent" as ProviderInstanceId },
} as McpInvocationContext.McpInvocationScope;

const countingRandom = () => {
  let draws = 0;
  return SecureRandom.make((size) => new Uint8Array(size).fill(++draws));
};

const layerStore = () =>
  QuietThreadSend.layer.pipe(
    Layer.provideMerge(
      Layer.fresh(ServerConfig.layerTest(process.cwd(), { prefix: "t3code-held-notes-test-" })),
    ),
    Layer.provideMerge(Layer.succeed(SecureRandom.SecureRandom, countingRandom())),
    Layer.provideMerge(NodeServices.layer),
  );

const userTurn = { createdBy: "user", creationSource: "web" };

const sender = (idle: ReadonlySet<string>) => {
  const sent: Array<object> = [];
  const gated = withForkToolGates({
    t3_thread_send: (params: object) =>
      Effect.suspend(() => {
        sent.push(params);
        const threadId = ThreadId.make((params as { threadId: string }).threadId);
        return idle.has(threadId)
          ? Effect.fail(
              new OrchestratorMcpFailure({
                code: "thread_not_sendable",
                message: new ThreadManagementNoSteerableRunError({ threadId, mode: "steer" })
                  .message,
              }),
            )
          : Effect.succeed({ threadId, delivery: "steered" });
      }),
  });
  const send = (params: object) =>
    gated
      .t3_thread_send(params)
      .pipe(Effect.provideService(McpInvocationContext.McpInvocationContext, scope));
  return { sent, send };
};

it.layer(NodeServices.layer)("quiet thread send", (it) => {
  it.effect("steers a running thread and holds a note for an idle one until its next turn", () =>
    Effect.gen(function* () {
      const { sent, send } = sender(new Set([hubId]));
      const running = ThreadId.make("thread:busy");
      const steered = yield* send({
        threadId: running,
        message: "FYI",
        mode: "queue",
        wake: false,
      });
      assert.deepEqual(steered, { threadId: running, delivery: "steered" });
      const held = yield* send({ threadId: hubId, message: "Case closed: FN-1", wake: false });
      assert.deepInclude(held, { threadId: hubId, delivery: "held" });
      assert.deepEqual(sent, [
        { threadId: running, message: "FYI", mode: "steer" },
        { threadId: hubId, message: "Case closed: FN-1", mode: "steer" },
      ]);

      const notes = QuietThreadSend.heldNotesFor(hubId, userTurn, false);
      assert.lengthOf(notes, 1);
      assert.include(QuietThreadSend.heldNotesContext(notes), `From thread ${caseId}`);
      assert.include(QuietThreadSend.heldNotesContext(notes), "Case closed: FN-1");
      assert.deepEqual(
        QuietThreadSend.heldNotesFor(
          hubId,
          { createdBy: "agent", creationSource: "provider" },
          false,
        ),
        [],
      );
      assert.deepEqual(QuietThreadSend.heldNotesFor(hubId, userTurn, true), []);
      assert.deepEqual(QuietThreadSend.heldNotesFor(caseId, userTurn, false), []);

      yield* QuietThreadSend.releaseHeldNotes(notes);
      assert.deepEqual(QuietThreadSend.heldNotesFor(hubId, userTurn, false), []);
    }).pipe(Effect.provide(layerStore())),
  );

  it.effect("keeps held notes across a restart", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { send } = sender(new Set([hubId]));
      yield* send({ threadId: hubId, message: "No reply needed", wake: false });
      const file = path.join(config.stateDir, "fork-held-thread-notes.json");
      assert.include(yield* fs.readFileString(file), "No reply needed");
      yield* Layer.build(QuietThreadSend.layer).pipe(Effect.scoped);
      const notes = QuietThreadSend.heldNotesFor(hubId, userTurn, false);
      assert.deepEqual(
        notes.map((note) => note.text),
        ["No reply needed"],
      );
      yield* QuietThreadSend.releaseHeldNotes(notes);
    }).pipe(Effect.provide(layerStore())),
  );

  it.effect("sends as upstream does while Quiet thread send is off", () =>
    Effect.gen(function* () {
      const { sent, send } = sender(new Set([hubId]));
      using _settings = overrideForkFeatureSettings({ features: { quietThreadSend: false } });
      yield* send({ threadId: caseId, message: "Hi", mode: "queue", wake: false });
      yield* send({ threadId: caseId, message: "Hi", wake: true });
      assert.deepEqual(sent, [
        { threadId: caseId, message: "Hi", mode: "queue" },
        { threadId: caseId, message: "Hi" },
      ]);
    }).pipe(Effect.provide(layerStore())),
  );
});
