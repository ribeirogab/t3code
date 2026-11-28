import { ThreadId, type OrchestrationV2DomainEvent } from "@t3tools/contracts";
import { buildTailscaleHttpsBaseUrl } from "@t3tools/tailscale";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export interface PublishedPortRecord {
  readonly port: number;
  readonly threadId: ThreadId;
  readonly target: number;
  readonly hostRewrite: boolean;
  readonly url: string;
}

export const PublishedPortRecordSchema = Schema.Struct({
  port: Schema.Int,
  threadId: ThreadId,
  target: Schema.Int,
  hostRewrite: Schema.Boolean,
  url: Schema.String,
});

export const PublishedPortsFileSchema = Schema.Struct({
  ports: Schema.Array(PublishedPortRecordSchema),
});

export type ServedProxies = ReadonlyMap<number, string | null>;

export function normalizePublishedPath(path: string | undefined): string {
  const trimmed = path?.trim() ?? "";
  if (trimmed.length === 0) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function publishedPortUrl(input: {
  readonly dnsName: string;
  readonly port: number;
  readonly path: string;
}): string {
  const base = new URL(buildTailscaleHttpsBaseUrl({ magicDnsName: input.dnsName }));
  base.port = String(input.port);
  return new URL(normalizePublishedPath(input.path), base).toString();
}

export function loopbackTarget(port: number): string {
  return `http://127.0.0.1:${port}`;
}

const ServeStatusJson = Schema.NullOr(
  Schema.Struct({
    TCP: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    Web: Schema.optional(
      Schema.Record(
        Schema.String,
        Schema.Struct({
          Handlers: Schema.optional(
            Schema.Record(Schema.String, Schema.Struct({ Proxy: Schema.optional(Schema.String) })),
          ),
        }),
      ),
    ),
  }),
);

const decodeServeStatus = Schema.decodeUnknownOption(Schema.fromJsonString(ServeStatusJson));

function portOfHostPort(hostPort: string): number | undefined {
  const port = Number(hostPort.slice(hostPort.lastIndexOf(":") + 1));
  return Number.isInteger(port) ? port : undefined;
}

export function parseServedProxies(rawServeStatusJson: string): ServedProxies | undefined {
  const decoded = decodeServeStatus(rawServeStatusJson);
  if (Option.isNone(decoded)) return undefined;
  const served = new Map<number, string | null>();
  for (const port of Object.keys(decoded.value?.TCP ?? {}).map(Number)) {
    if (Number.isInteger(port)) served.set(port, null);
  }
  for (const [hostPort, site] of Object.entries(decoded.value?.Web ?? {})) {
    const port = portOfHostPort(hostPort);
    if (port === undefined) continue;
    served.set(port, site.Handlers?.["/"]?.Proxy ?? served.get(port) ?? null);
  }
  return served;
}

export function servesRecord(served: ServedProxies, record: PublishedPortRecord): boolean {
  return served.get(record.port) === loopbackTarget(record.target);
}

export function reconcilePublishedPorts(
  records: ReadonlyArray<PublishedPortRecord>,
  served: ServedProxies,
): {
  readonly kept: ReadonlyArray<PublishedPortRecord>;
  readonly dropped: ReadonlyArray<PublishedPortRecord>;
} {
  const kept: PublishedPortRecord[] = [];
  const dropped: PublishedPortRecord[] = [];
  const seen = new Set<number>();
  for (const record of records) {
    if (!seen.has(record.port) && servesRecord(served, record)) {
      kept.push(record);
      seen.add(record.port);
    } else {
      dropped.push(record);
    }
  }
  return { kept, dropped };
}

export const PORT_RELEASE_EVENTS: ReadonlySet<OrchestrationV2DomainEvent["type"]> = new Set([
  "thread.settled",
  "thread.archived",
  "thread.deleted",
]);

export function threadReleasesPorts(thread: {
  readonly settledOverride: "settled" | "active" | null;
  readonly archivedAt: unknown;
  readonly deletedAt: unknown;
}): boolean {
  return (
    thread.settledOverride === "settled" || thread.archivedAt != null || thread.deletedAt != null
  );
}

const BODY_PREVIEW_LENGTH = 300;

export function failedCheckDetail(input: {
  readonly url: string;
  readonly status: number;
  readonly body: string;
  readonly hostRewrite: boolean;
}): string {
  const body = input.body.trim().slice(0, BODY_PREVIEW_LENGTH);
  const hint =
    input.status === 403 && !input.hostRewrite
      ? " The server may refuse a foreign Host: publish again with hostRewrite: true."
      : "";
  return `GET ${input.url} answered ${input.status}${body.length > 0 ? `: ${body}` : ""}. The port is off again.${hint}`;
}
