import type { ModelSelection, ScopedProjectRef } from "@t3tools/contracts";

import {
  composerDraftHasUserContent,
  type DraftId,
  useComposerDraftStore,
} from "~/composerDraftStore";
import { hasExplicitComposerModelSelection } from "~/lib/chatThreadActions";

export function draftProjectTargetKey(draftId: DraftId): string | null {
  const session = useComposerDraftStore.getState().getDraftSession(draftId);
  return session
    ? `${session.environmentId}:${session.projectId}:${session.logicalProjectKey}`
    : null;
}

export function retargetDraftProject(input: {
  readonly draftId: DraftId;
  readonly projectRef: ScopedProjectRef;
  readonly logicalProjectKey: string;
  readonly openProjectDraft: (projectRef: ScopedProjectRef) => Promise<unknown>;
  readonly resolveModelSelection: () => ModelSelection | null | undefined;
}): void {
  const store = useComposerDraftStore.getState();
  const session = store.getDraftSession(input.draftId);
  if (
    session?.environmentId === input.projectRef.environmentId &&
    session.projectId === input.projectRef.projectId
  ) {
    return;
  }
  const currentDraft = store.getComposerDraft(input.draftId);
  if (!composerDraftHasUserContent(currentDraft)) {
    void input.openProjectDraft(input.projectRef);
    return;
  }
  store.setLogicalProjectDraftThreadId(input.logicalProjectKey, input.projectRef, input.draftId);
  if (hasExplicitComposerModelSelection(currentDraft)) return;
  store.applyStickyState(input.draftId);
  const modelSelection = input.resolveModelSelection();
  if (modelSelection) {
    store.setModelSelection(input.draftId, modelSelection, { replaceOptions: true });
  }
}
