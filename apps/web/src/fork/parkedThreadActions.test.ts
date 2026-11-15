import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { setThreadParked } from "./parkedThreadActions";

const state = vi.hoisted(() => ({
  runAtomCommand: vi.fn(async (..._args: ReadonlyArray<unknown>) => ({ _tag: "Success" })),
}));

vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  isAtomCommandInterrupted: () => false,
  runAtomCommand: state.runAtomCommand,
  squashAtomCommandFailure: () => null,
}));
vi.mock("~/rpc/atomRegistry", () => ({
  appAtomRegistry: { get: () => ({ parkedThreadIds: ["thread-parked"] }) },
}));
vi.mock("~/state/server", () => ({
  serverEnvironment: { settingsValueAtom: () => "settings", updateSettings: "update-settings" },
}));
vi.mock("~/state/threads", () => ({ threadEnvironment: { unsettle: "unsettle" } }));
vi.mock("~/components/ui/toast", () => ({
  stackedThreadToast: (toast: unknown) => toast,
  toastManager: { add: vi.fn() },
}));
vi.mock("./forkFeatures", () => ({ isForkFeatureEnabled: () => true }));

const threadRef = {
  environmentId: EnvironmentId.make("environment"),
  threadId: ThreadId.make("thread-parked"),
};

describe("setThreadParked", () => {
  it("un-settles the thread only when it leaves the Parked shelf", async () => {
    state.runAtomCommand.mockClear();
    await setThreadParked(threadRef, false);
    expect(state.runAtomCommand.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      [
        "update-settings",
        { environmentId: "environment", input: { patch: { parkedThreadIds: [] } } },
      ],
      [
        "unsettle",
        { environmentId: "environment", input: { threadId: "thread-parked", reason: "user" } },
      ],
    ]);

    state.runAtomCommand.mockClear();
    await setThreadParked(threadRef, true);
    expect(state.runAtomCommand.mock.calls.map((call) => call[1])).toEqual(["update-settings"]);
  });
});
