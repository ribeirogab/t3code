import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import type { EnvironmentId } from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { resolveNewThreadModelSelection } from "@t3tools/shared/usageLimits";

import { useCommandPaletteStore } from "~/commandPaletteStore";
import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useScratchProject } from "~/hooks/useScratchProject";
import { useClientSettings } from "~/hooks/useSettings";
import { useThreadRouteTarget } from "~/hooks/useThreadRouteTarget";
import { resolveProjectDefaultProviderModelSelection } from "~/providerInstances";
import { useEnvironmentProviders, useEnvironments } from "~/state/environments";
import type { Project } from "~/types";
import { draftProjectTargetKey, retargetDraftProject } from "./draftProjectRetarget";
import { useForkFeature } from "./forkFeatures";
import { draftProjectPickerTarget, openDraftProjectPicker } from "./newThreadNoProject";

export function useDraftProjectPickerOpener(isServerThread: boolean): (() => void) | null {
  const enabled = useForkFeature("newThreadNoProject");
  const routeTarget = useThreadRouteTarget();
  if (!enabled || isServerThread || routeTarget?.kind !== "draft") return null;
  const { draftId } = routeTarget;
  return () => openDraftProjectPicker(draftId);
}

function useDraftProjectRetarget() {
  const { environments } = useEnvironments();
  const providersByEnvironment = useEnvironmentProviders();
  const openProjectDraft = useNewThreadHandler();
  const resolveModelSelection = (project: Project) => {
    const environmentSettings = environments.find(
      (environment) => environment.environmentId === project.environmentId,
    )?.serverConfig?.settings;
    const providers = providersByEnvironment.get(project.environmentId) ?? [];
    const defaultSelection = environmentSettings
      ? resolveProjectSettings(environmentSettings, project.id, project).settings
          .defaultModelSelection
      : project.defaultModelSelection;
    const resolution = resolveNewThreadModelSelection({
      defaultSelection:
        defaultSelection ??
        (useComposerDraftStore.getState().stickyActiveProvider !== null || !environmentSettings
          ? null
          : resolveProjectDefaultProviderModelSelection(
              providers,
              environmentSettings,
              project.id,
            )),
      fallbackSelection: environmentSettings?.fallbackModelSelection ?? null,
      providers,
      ...(environmentSettings ? { settings: environmentSettings } : {}),
      projectId: project.id,
      now: Date.now(),
    });
    return resolution.fallback ? resolution.selection : defaultSelection;
  };
  return (draftId: DraftId, project: Project, logicalProjectKey: string) =>
    retargetDraftProject({
      draftId,
      projectRef: scopeProjectRef(project.environmentId, project.id),
      logicalProjectKey,
      openProjectDraft,
      resolveModelSelection: () => resolveModelSelection(project),
    });
}

export function useDraftProjectPick() {
  const enabled = useForkFeature("newThreadNoProject");
  const draftId = useCommandPaletteStore(draftProjectPickerTarget);
  const retarget = useDraftProjectRetarget();
  const { openScratchProject } = useScratchProject();
  const groupingSettings = useClientSettings(selectProjectGroupingSettings);
  if (!enabled || draftId === null) return null;
  const logicalKey = (project: Project) =>
    deriveLogicalProjectKeyFromSettings(project, groupingSettings);
  return {
    pickProject: (project: Project, logicalProjectKey: string | undefined) =>
      retarget(draftId, project, logicalProjectKey ?? logicalKey(project)),
    pickNoProject: async (environmentId: EnvironmentId) => {
      const requestedTarget = draftProjectTargetKey(draftId);
      const project = await openScratchProject(environmentId);
      if (!project || draftProjectTargetKey(draftId) !== requestedTarget) return;
      retarget(draftId, project, logicalKey(project));
    },
  };
}
