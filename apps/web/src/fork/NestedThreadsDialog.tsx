import { CommandId, type ScopedThreadRef } from "@t3tools/contracts";
import { useEffect } from "react";
import { create } from "zustand";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { randomUUID } from "~/lib/utils";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { environmentThreadShells } from "~/state/threads";

import {
  sidebarDescendantRefs,
  type NestedRemoval,
  type NestedRemovalChoice,
} from "./nestedThreadRemoval";

type NestedRemovalAction = "archive" | "delete";
type DialogChoice = Exclude<NestedRemovalChoice, "none">;

interface NestedRemovalRequest {
  readonly action: NestedRemovalAction;
  readonly title: string;
  readonly childCount: number;
  readonly resolve: (choice: DialogChoice) => void;
}

const useNestedRemovalRequest = create<{ request: NestedRemovalRequest | null }>(() => ({
  request: null,
}));

function finish(choice: DialogChoice) {
  const { request } = useNestedRemovalRequest.getState();
  useNestedRemovalRequest.setState({ request: null });
  request?.resolve(choice);
}

function requestNestedRemoval(input: Omit<NestedRemovalRequest, "resolve">): Promise<DialogChoice> {
  useNestedRemovalRequest.getState().request?.resolve("cancel");
  return new Promise((resolve) =>
    useNestedRemovalRequest.setState({ request: { ...input, resolve } }),
  );
}

export async function chooseNestedRemoval(input: {
  readonly action: NestedRemovalAction;
  readonly threadRef: ScopedThreadRef;
  readonly title: string;
}): Promise<NestedRemoval> {
  const threads = appAtomRegistry.get(environmentThreadShells.quietThreadShellsAtom);
  const descendants = sidebarDescendantRefs(threads, input.threadRef);
  const archiveBatchId = CommandId.make(randomUUID());
  if (descendants.length === 0) return { choice: "none", descendants, archiveBatchId };
  const choice = await requestNestedRemoval({
    action: input.action,
    title: input.title,
    childCount: descendants.length,
  });
  return { choice, descendants, archiveBatchId };
}

function dialogCopy(request: NestedRemovalRequest) {
  const verb = request.action === "archive" ? "Archive" : "Delete";
  const nested = `${request.childCount} nested ${request.childCount === 1 ? "thread" : "threads"}`;
  const pronoun = request.childCount === 1 ? "it moves" : "they move";
  return {
    title: `${verb} "${request.title}"?`,
    description: [
      `It has ${nested}. ${verb} only this thread and ${pronoun} to the top level.`,
      request.action === "delete" ? "This permanently clears conversation history." : null,
    ]
      .filter((line) => line !== null)
      .join(" "),
    all: `${verb} all ${request.childCount + 1} threads`,
    this: `${verb} this thread`,
  };
}

export function NestedThreadsDialogHost() {
  const request = useNestedRemovalRequest((state) => state.request);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- resolves a pending removal request when the host unmounts
  useEffect(() => () => finish("cancel"), []);
  if (request === null) return null;
  const copy = dialogCopy(request);
  const destructive = request.action === "delete";
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) finish("cancel");
      }}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
          <Button
            variant={destructive ? "destructive-outline" : "outline"}
            onClick={() => finish("all")}
          >
            {copy.all}
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={() => finish("this")}>
            {copy.this}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
