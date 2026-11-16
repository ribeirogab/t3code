import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { retargetDraftProject } from "./draftProjectRetarget";

const environmentId = EnvironmentId.make("environment-local");
const scratchRef = scopeProjectRef(environmentId, ProjectId.make("project-scratch"));
const pickedRef = scopeProjectRef(environmentId, ProjectId.make("project-picked"));
const draftId = DraftId.make("draft-no-project");

function setup(prompt: string) {
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
  const store = useComposerDraftStore.getState();
  store.setLogicalProjectDraftThreadId(scopedProjectKey(scratchRef), scratchRef, draftId, {
    threadId: ThreadId.make("thread-no-project"),
  });
  store.setPrompt(draftId, prompt);
  const openProjectDraft = vi.fn(async () => undefined);
  retargetDraftProject({
    draftId,
    projectRef: pickedRef,
    logicalProjectKey: scopedProjectKey(pickedRef),
    openProjectDraft,
    resolveModelSelection: () => null,
  });
  return { openProjectDraft, state: useComposerDraftStore.getState() };
}

describe("retargetDraftProject", () => {
  it("moves a written draft to the picked project and keeps its text", () => {
    const { openProjectDraft, state } = setup("keep this prompt");

    expect(state.getDraftSession(draftId)).toMatchObject({
      environmentId,
      projectId: pickedRef.projectId,
    });
    expect(state.getComposerDraft(draftId)?.prompt).toBe("keep this prompt");
    expect(openProjectDraft).not.toHaveBeenCalled();
  });

  it("opens the picked project's draft when the draft is empty", () => {
    const { openProjectDraft, state } = setup("");

    expect(openProjectDraft).toHaveBeenCalledWith(pickedRef);
    expect(state.getDraftSession(draftId)?.projectId).toBe(scratchRef.projectId);
  });
});
