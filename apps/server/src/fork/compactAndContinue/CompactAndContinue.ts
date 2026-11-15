import type { CommandId, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Orchestrator from "../../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../../orchestration-v2/ProjectionStore.ts";
import {
  compactAndContinueCommands,
  compactAndContinueProblem,
  compactAndContinueTexts,
  type CompactAndContinueInput,
} from "./compactAndContinueRules.ts";

class CompactAndContinueError extends Schema.TaggedError<CompactAndContinueError>()(
  "CompactAndContinueError",
  { detail: Schema.String },
) {}

export class CompactAndContinue extends Context.Service<
  CompactAndContinue,
  {
    readonly queue: (
      input: CompactAndContinueInput & {
        readonly commandId: CommandId;
        readonly threadId: ThreadId;
      },
    ) => Effect.Effect<ReadonlyArray<string>, CompactAndContinueError>;
  }
>()("t3/fork/compactAndContinue/CompactAndContinue") {}

const failed = (detail: string) => () => new CompactAndContinueError({ detail });

const make = Effect.gen(function* () {
  const engine = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;

  const queue: CompactAndContinue["Service"]["queue"] = Effect.fn("CompactAndContinue.queue")(
    function* (input) {
      const { thread, providerThreads } = yield* projections
        .getThreadRecords(input.threadId, ["providerThreads"])
        .pipe(Effect.mapError(failed("The thread could not be read.")));
      const driver = providerThreads.find(
        (candidate) => candidate.id === thread.activeProviderThreadId,
      )?.driver;
      const problem = compactAndContinueProblem(input, driver);
      if (problem !== null) return yield* new CompactAndContinueError({ detail: problem });
      const texts = compactAndContinueTexts(input);
      for (const command of compactAndContinueCommands({ ...input, texts })) {
        yield* engine
          .dispatch(command)
          .pipe(Effect.mapError(failed(`T3 Code could not queue ${command.text.split("\n")[0]}.`)));
      }
      return texts;
    },
  );

  return { queue } satisfies CompactAndContinue["Service"];
});

export const layer = Layer.effect(CompactAndContinue, make);
