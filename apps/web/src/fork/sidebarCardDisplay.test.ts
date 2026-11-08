import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_SIDEBAR_CARD_DISPLAY,
  mergePersistedSidebarCardDisplay,
  useSidebarCardDisplayStore,
} from "./sidebarCardDisplay";

describe("sidebar card display", () => {
  it("hides only the branch by default", () => {
    expect(DEFAULT_SIDEBAR_CARD_DISPLAY).toEqual({
      project: true,
      branch: false,
      machine: true,
      pullRequest: true,
      terminal: true,
      diff: true,
      model: true,
    });
  });

  it("falls back to the defaults for missing or malformed persisted state", () => {
    expect(mergePersistedSidebarCardDisplay(undefined)).toEqual(DEFAULT_SIDEBAR_CARD_DISPLAY);
    expect(mergePersistedSidebarCardDisplay({ display: "all" })).toEqual(
      DEFAULT_SIDEBAR_CARD_DISPLAY,
    );
  });

  it("keeps stored booleans and fills unknown fields from the defaults", () => {
    expect(
      mergePersistedSidebarCardDisplay({
        display: { branch: true, model: false, diff: "no", legacy: false },
      }),
    ).toEqual({ ...DEFAULT_SIDEBAR_CARD_DISPLAY, branch: true, model: false });
  });

  it("toggles one field without touching the others", () => {
    useSidebarCardDisplayStore.getState().setFieldVisible("project", false);
    expect(useSidebarCardDisplayStore.getState().display).toEqual({
      ...DEFAULT_SIDEBAR_CARD_DISPLAY,
      project: false,
    });
  });
});
