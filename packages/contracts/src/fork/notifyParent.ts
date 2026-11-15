import * as Schema from "effect/Schema";

export const ForkNotifyParent = Schema.Literals(["on_finish", "on_question", "never", "on_close"]);
export type ForkNotifyParent = typeof ForkNotifyParent.Type;

export const ForkNotifyParentToolInput = Schema.Literals([
  "on_finish",
  "on_question",
  "never",
]).annotate({
  description:
    "'on_finish' (default): result and questions wake you. 'on_question': only questions. 'never': no wake; use task_status. A failed child always wakes you.",
});

export const ForkOwnerFacingToolInput = Schema.Boolean.annotate({
  description:
    "true: the user works in the child directly. Sets listed:true and notifyParent:'never', and wakes you once when the user closes its thread.",
});
