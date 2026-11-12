import { ForkPublishedPortError } from "@t3tools/contracts";
import { parseTailscaleStatus } from "@t3tools/tailscale";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpClient } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { loopbackTarget, parseServedProxies, type ServedProxies } from "./publishedPortRules.ts";

const COMMAND_TIMEOUT = Duration.seconds(15);
const KILL_GRACE = Duration.millis(500);
const CHECK_TIMEOUT = Duration.seconds(20);
const STDERR_PREVIEW_LENGTH = 300;

export interface CheckResult {
  readonly status: number;
  readonly body: string;
}

export interface TailnetServe {
  readonly dnsName: Effect.Effect<string, ForkPublishedPortError>;
  readonly servedProxies: Effect.Effect<ServedProxies, ForkPublishedPortError>;
  readonly serve: (port: number, target: number) => Effect.Effect<void, ForkPublishedPortError>;
  readonly off: (port: number) => Effect.Effect<void, ForkPublishedPortError>;
  readonly check: (url: string) => Effect.Effect<CheckResult, ForkPublishedPortError>;
}

const isForkPublishedPortError = Schema.is(ForkPublishedPortError);

const failure = (detail: string, port?: number) =>
  new ForkPublishedPortError({ detail, ...(port === undefined ? {} : { port }) });

const readText = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (text, chunk) => text + chunk,
    ),
  );

const notInstalled = (cause: unknown) =>
  failure(
    `tailscale is not installed on this server host, or it is not on the server's PATH (${String(cause)}).`,
  );

const runTailscale = Effect.fn("PublishedPorts.runTailscale")(function* (
  args: ReadonlyArray<string>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const commandLine = `tailscale ${args.join(" ")}`;
  return yield* Effect.gen(function* () {
    const child = yield* spawner
      .spawn(ChildProcess.make("tailscale", [...args], { forceKillAfter: KILL_GRACE }))
      .pipe(
        Effect.mapError(notInstalled),
        Effect.catchDefect((cause) => Effect.fail(notInstalled(cause))),
      );
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [readText(child.stdout), readText(child.stderr), child.exitCode.pipe(Effect.map(Number))],
      { concurrency: "unbounded" },
    ).pipe(Effect.mapError((cause) => failure(`${commandLine} failed: ${String(cause)}`)));
    if (exitCode !== 0) {
      const reason = stderr.trim().slice(0, STDERR_PREVIEW_LENGTH);
      return yield* failure(
        `${commandLine} exited with code ${exitCode}${reason.length > 0 ? `: ${reason}` : "."}`,
      );
    }
    return { stdout, stderr };
  }).pipe(
    Effect.scoped,
    Effect.timeoutOrElse({
      duration: COMMAND_TIMEOUT,
      orElse: () =>
        Effect.fail(
          failure(`${commandLine} did not answer in ${Duration.format(COMMAND_TIMEOUT)}.`),
        ),
    }),
  );
});

const readDnsName = runTailscale(["status", "--json"]).pipe(
  Effect.flatMap(({ stdout }) =>
    parseTailscaleStatus(stdout).pipe(
      Effect.mapError(() =>
        failure("tailscale status --json printed JSON this server cannot read."),
      ),
    ),
  ),
  Effect.flatMap((status) => {
    if (status.magicDnsName === null) {
      return Effect.fail(
        failure("This node has no MagicDNS name. Turn on MagicDNS in the tailnet."),
      );
    }
    if (status.httpsServeEnabled === false) {
      return Effect.fail(
        failure("HTTPS certificates are off in this tailnet, so tailscale serve cannot use HTTPS."),
      );
    }
    return Effect.succeed(status.magicDnsName);
  }),
);

const readServedProxies = runTailscale(["serve", "status", "--json"]).pipe(
  Effect.flatMap(({ stdout }) => {
    const served = parseServedProxies(stdout.trim().length === 0 ? "null" : stdout);
    return served === undefined
      ? Effect.fail(failure("tailscale serve status --json printed JSON this server cannot read."))
      : Effect.succeed(served);
  }),
);

const HANDLER_GONE = /handler does not exist|not found|nothing to remove/i;

const turnOff = (port: number) =>
  runTailscale(["serve", `--https=${port}`, "--set-path=/", "off"]).pipe(
    Effect.asVoid,
    Effect.catchIf(
      (error) => HANDLER_GONE.test(error.detail),
      () => Effect.void,
    ),
  );

export const makeTailnetServe = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const client = yield* HttpClient.HttpClient;
  const withSpawner = <A, E>(
    effect: Effect.Effect<A, E, ChildProcessSpawner.ChildProcessSpawner>,
  ): Effect.Effect<A, E> =>
    Effect.provideService(effect, ChildProcessSpawner.ChildProcessSpawner, spawner);

  const check = (url: string) =>
    client.get(url).pipe(
      Effect.flatMap((response) =>
        response.text.pipe(
          Effect.orElseSucceed(() => ""),
          Effect.map((body) => ({ status: response.status, body })),
        ),
      ),
      Effect.timeoutOrElse({
        duration: CHECK_TIMEOUT,
        orElse: () =>
          Effect.fail(failure(`GET ${url} did not answer in ${Duration.format(CHECK_TIMEOUT)}.`)),
      }),
      Effect.mapError((cause) =>
        isForkPublishedPortError(cause) ? cause : failure(`GET ${url} failed: ${cause.message}`),
      ),
    );

  return {
    dnsName: withSpawner(readDnsName),
    servedProxies: withSpawner(readServedProxies),
    serve: (port, target) =>
      withSpawner(
        runTailscale(["serve", "--bg", `--https=${port}`, loopbackTarget(target)]).pipe(
          Effect.asVoid,
        ),
      ),
    off: (port) => withSpawner(turnOff(port)),
    check,
  } satisfies TailnetServe;
});
