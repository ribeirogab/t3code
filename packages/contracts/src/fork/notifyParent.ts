import * as Schema from "effect/Schema";

export const ForkNotifyParent = Schema.Literals(["on_finish", "on_question", "never"]);
export type ForkNotifyParent = typeof ForkNotifyParent.Type;

export const ForkNotifyParentToolInput = ForkNotifyParent.annotate({
  description:
    "'on_finish' (default): result and questions wake you. 'on_question': only questions. 'never': no wake; use task_status.",
});
