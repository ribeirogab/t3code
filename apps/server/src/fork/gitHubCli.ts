import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as ProcessRunner from "../processRunner.ts";

const GH_TIMEOUT = "20 seconds";
const STDERR_PREVIEW_LENGTH = 300;
const RUN_FIELDS = "databaseId,workflowName,status,conclusion,url,createdAt";

const WorkflowRun = Schema.Struct({
  databaseId: Schema.Number,
  workflowName: Schema.String,
  status: Schema.String,
  conclusion: Schema.String,
  url: Schema.String,
  createdAt: Schema.String,
});
export type WorkflowRun = typeof WorkflowRun.Type;

const decodeRuns = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(WorkflowRun)));

export class ForkGitHubCliError extends Schema.TaggedError<ForkGitHubCliError>()(
  "ForkGitHubCliError",
  { detail: Schema.String },
) {}

export interface GitHubRepository {
  readonly host: string;
  readonly repository: string;
}

export interface WorkflowRunQuery extends GitHubRepository {
  readonly branch: string;
  readonly sha: string;
  readonly workflow: string | null;
}

export class ForkGitHubCli extends Context.Service<
  ForkGitHubCli,
  {
    readonly branchHead: (
      input: GitHubRepository & { readonly branch: string },
    ) => Effect.Effect<string, ForkGitHubCliError>;
    readonly workflowRuns: (
      input: WorkflowRunQuery,
    ) => Effect.Effect<ReadonlyArray<WorkflowRun>, ForkGitHubCliError>;
  }
>()("t3/fork/gitHubCli/ForkGitHubCli") {}

const refPath = (branch: string) => branch.split("/").map(encodeURIComponent).join("/");

const branchHeadArgs = (input: GitHubRepository & { readonly branch: string }) => [
  "api",
  "--hostname",
  input.host,
  `repos/${input.repository}/git/ref/heads/${refPath(input.branch)}`,
  "--jq",
  ".object.sha",
];

const workflowRunArgs = (input: WorkflowRunQuery) => [
  "run",
  "list",
  "--repo",
  `${input.host}/${input.repository}`,
  "--branch",
  input.branch,
  "--commit",
  input.sha,
  ...(input.workflow === null ? [] : ["--workflow", input.workflow]),
  "--limit",
  "50",
  "--json",
  RUN_FIELDS,
];

const make = Effect.gen(function* () {
  const runner = yield* ProcessRunner.ProcessRunner;

  const gh = Effect.fn("ForkGitHubCli.gh")(function* (args: ReadonlyArray<string>) {
    const output = yield* runner
      .run({
        command: "gh",
        args,
        timeout: GH_TIMEOUT,
        env: { GH_PROMPT_DISABLED: "1", GH_DEBUG: "" },
      })
      .pipe(
        Effect.mapError(
          (error) =>
            new ForkGitHubCliError({
              detail: `gh could not run on the T3 server host: ${error.message}`,
            }),
        ),
      );
    if (output.code !== 0) {
      return yield* new ForkGitHubCliError({
        detail: `gh ${args.slice(0, 2).join(" ")} failed: ${output.stderr.trim().slice(0, STDERR_PREVIEW_LENGTH)}`,
      });
    }
    return output.stdout.trim();
  });

  const branchHead = Effect.fn("ForkGitHubCli.branchHead")(function* (
    input: GitHubRepository & { readonly branch: string },
  ) {
    const sha = yield* gh(branchHeadArgs(input));
    if (!/^[0-9a-f]{40,64}$/.test(sha)) {
      return yield* new ForkGitHubCliError({
        detail: `No branch ${input.branch} in ${input.repository}.`,
      });
    }
    return sha;
  });

  const workflowRuns = Effect.fn("ForkGitHubCli.workflowRuns")(function* (input: WorkflowRunQuery) {
    const stdout = yield* gh(workflowRunArgs(input));
    return yield* decodeRuns(stdout).pipe(
      Effect.mapError(
        () => new ForkGitHubCliError({ detail: "gh run list returned unreadable JSON." }),
      ),
    );
  });

  return ForkGitHubCli.of({ branchHead, workflowRuns });
});

export const layer = Layer.effect(ForkGitHubCli, make).pipe(Layer.provide(ProcessRunner.layer));
