import { describe, expect, it } from "vite-plus/test";

import { getDesktopUpdateInstallConfirmationMessage } from "../components/desktopUpdate.logic";
import { activeTurnTitles, updateInstallConfirmation } from "./updateActiveTurns.logic";

const state = { availableVersion: "0.1.8-nightly.20261108.4367001", downloadedVersion: null };

describe("updateInstallConfirmation", () => {
  it("keeps the upstream dialog when no thread has an active turn", () => {
    expect(updateInstallConfirmation(state, [])).toEqual([
      getDesktopUpdateInstallConfirmationMessage(state),
      { initialFocus: "confirm" },
    ]);
  });

  it("names the threads with an active turn and focuses Cancel", () => {
    expect(
      updateInstallConfirmation(state, [
        "Release batch",
        "Agent language in every wake",
        "Fix the checkout errors",
      ]),
    ).toEqual([
      [
        "Install update 0.1.8-nightly.20261108.4367001 and restart T3 Code?",
        "",
        "3 threads have an active turn",
        "Release batch",
        "Agent language in every wake",
        "Fix the checkout errors",
        "",
        "Installing now stops them.",
      ].join("\n"),
      { initialFocus: "cancel" },
    ]);
    expect(updateInstallConfirmation(state, ["Only one"])[0]).toContain(
      "\n1 thread has an active turn\nOnly one\n",
    );
  });
});

describe("activeTurnTitles", () => {
  it("keeps the threads whose turn is preparing, starting or running", () => {
    expect(
      activeTurnTitles([
        { status: "preparing", title: "Preparing" },
        { status: "starting", title: "Starting" },
        { status: "running", title: "Running" },
        { status: "queued", title: "Queued" },
        { status: "waiting", title: "Waiting" },
        { status: "completed", title: "Completed" },
        { status: "idle", title: "Idle" },
      ]),
    ).toEqual(["Preparing", "Starting", "Running"]);
  });
});
