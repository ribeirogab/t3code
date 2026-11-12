import {
  FORK_CONSENT_REFUSAL_TEXT,
  FORK_NEEDS_YES_OUTPUT_KEY,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";

const MAX_SEARCH_DEPTH = 4;
const MAX_COMMAND_OUTPUT_SCAN = 4_096;

function mentionsConsentRefusal(value: unknown, depth = 0): boolean {
  if (typeof value === "string") return value.includes(FORK_CONSENT_REFUSAL_TEXT);
  if (depth >= MAX_SEARCH_DEPTH || value === null || typeof value !== "object") return false;
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.some((child) => mentionsConsentRefusal(child, depth + 1));
}

function commandOutputRefusal(output: string | undefined): string | null {
  if (output === undefined) return null;
  const head = output.slice(0, MAX_COMMAND_OUTPUT_SCAN);
  return head.includes(FORK_CONSENT_REFUSAL_TEXT) ? head : null;
}

export function markConsentRefusal(
  raw: OrchestrationV2TurnItem,
  projected: OrchestrationV2TurnItem,
): OrchestrationV2TurnItem {
  if (raw.status !== "failed") return projected;
  if (raw.type === "dynamic_tool" && projected.type === "dynamic_tool") {
    if (!mentionsConsentRefusal(raw.output)) return projected;
    const output =
      projected.output !== null && typeof projected.output === "object" ? projected.output : {};
    return { ...projected, output: { ...output, [FORK_NEEDS_YES_OUTPUT_KEY]: true } };
  }
  if (raw.type === "command_execution" && projected.type === "command_execution") {
    const refusal = commandOutputRefusal(raw.output);
    if (refusal === null) return projected;
    const { outputOmitted: _outputOmitted, ...rest } = projected;
    return { ...rest, output: refusal };
  }
  return projected;
}
