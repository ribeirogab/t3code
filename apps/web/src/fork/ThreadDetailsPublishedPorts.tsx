import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ForkPublishedPort, ThreadId } from "@t3tools/contracts";
import { GlobeLockIcon, LoaderCircleIcon, SquareIcon } from "lucide-react";
import { useState } from "react";

import { ThreadDetailsControl } from "~/components/chat/ThreadDetailsControl";
import { ThreadDetailsSection } from "~/components/chat/ThreadDetailsSection";
import { THREAD_DETAILS_PANEL_ICON_CLASS } from "~/components/chat/threadDetailsPanelStyles";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { readLocalApi } from "~/localApi";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";

import { useForkFeature } from "./forkFeatures";
import { forkPublishedPortsSubscription, forkUnpublishPort } from "./publishedPortsState";

const EMPTY_PORTS: ReadonlyArray<ForkPublishedPort> = Object.freeze([]);

interface ThreadDetailsPublishedPortsProps {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

export function ForkThreadDetailsPublishedPorts(props: ThreadDetailsPublishedPortsProps) {
  const enabled = useForkFeature("publishedPorts");
  if (!enabled) return null;
  return <PublishedPortsList key={`${props.environmentId}:${props.threadId}`} {...props} />;
}

function displayUrl(url: string): string {
  return url.replace(/^https:\/\//u, "").replace(/\/$/u, "");
}

function reportFailure(title: string, error: unknown) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : String(error),
    }),
  );
}

function PublishedPortsList(props: ThreadDetailsPublishedPortsProps) {
  const query = useEnvironmentQuery(
    forkPublishedPortsSubscription({
      environmentId: props.environmentId,
      input: { threadId: props.threadId },
    }),
  );
  const canStop = useAtomValue(forkUnpublishPort.permissionAtom(props.environmentId));
  const unpublish = useAtomCommand(forkUnpublishPort, { label: "published port stop" });
  const [stoppingPort, setStoppingPort] = useState<number | null>(null);
  const ports = query.data?.ports ?? EMPTY_PORTS;
  if (ports.length === 0) return null;

  const open = (url: string) =>
    void readLocalApi()
      ?.shell.openExternal(url)
      .catch((error: unknown) => reportFailure("Unable to open in browser", error));

  const stop = async (port: number) => {
    if (stoppingPort !== null) return;
    setStoppingPort(port);
    const result = await unpublish({ environmentId: props.environmentId, input: { port } });
    setStoppingPort(null);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      reportFailure("Could not stop port", squashAtomCommandFailure(result));
    }
  };

  return (
    <ThreadDetailsSection
      headingId="thread-details-published-ports-heading"
      title="Published ports"
    >
      <ul className="m-0 list-none p-0">
        {ports.map((port) => (
          <li key={port.port} className="group relative flex items-center rounded-lg">
            <ThreadDetailsControl
              size="sm"
              variant="ghost"
              part="row"
              title={port.url}
              onClick={() => open(port.url)}
            >
              <GlobeLockIcon aria-hidden className={THREAD_DETAILS_PANEL_ICON_CLASS} />
              <span
                className={
                  canStop
                    ? "min-w-0 flex-1 truncate pe-6 text-sm font-medium text-foreground/85"
                    : "min-w-0 flex-1 truncate text-sm font-medium text-foreground/85"
                }
              >
                {displayUrl(port.url)}
              </span>
            </ThreadDetailsControl>
            {canStop ? (
              <div className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <ThreadDetailsControl
                        size="icon-xs"
                        variant="ghost"
                        part="icon"
                        tone="destructive"
                        aria-label={`Stop publishing port ${port.port}`}
                        disabled={stoppingPort !== null}
                        onClick={() => void stop(port.port)}
                      />
                    }
                  >
                    {stoppingPort === port.port ? (
                      <LoaderCircleIcon aria-hidden className="size-3 animate-spin" />
                    ) : (
                      <SquareIcon aria-hidden className="size-3 fill-current" />
                    )}
                  </TooltipTrigger>
                  <TooltipPopup side="left">Stop publishing</TooltipPopup>
                </Tooltip>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </ThreadDetailsSection>
  );
}
