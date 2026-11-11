import { useForkFeature } from "./forkFeatures";

export function useStagePill() {
  const marked = useForkFeature("forkPill");
  return {
    variant: marked ? ("info" as const) : ("secondary" as const),
    label: (stageLabel: string) => (marked ? `${stageLabel} · Fork` : stageLabel),
  };
}
