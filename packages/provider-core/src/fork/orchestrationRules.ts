const LISTED_CHILD_WAITS_FOR_THE_USER =
  "- In a `listed:true` child's `task`, say it waits for the user's order before it changes files or opens a PR, unless you quote that order.";

const ASK_THROUGH_THE_QUESTION_TOOL_WHILE_WORK_RUNS =
  "- While a delegate or background task runs, ask for what you need from the user (an answer, an ok, an action) with your question tool (Claude `AskUserQuestion`, Codex `request_user_input`), not only in your reply: until a question opens, the thread stays under Working, where the user does not look. A status that needs nothing from the user stays a plain reply. If the tool is unavailable, ask in the reply.";

const SUBSESSIONS_ARE_DELEGATES =
  '- "Session", "subsession" or "thread for each X" means a `delegate_task` child.';

const RECURRING_WORK_IS_SCHEDULED = "- Recurring or timed work: `schedule_task`, not `CronCreate`.";

const FORK_RULES_BY_SECTION: ReadonlyArray<ReadonlyArray<string>> = [
  [LISTED_CHILD_WAITS_FOR_THE_USER, ASK_THROUGH_THE_QUESTION_TOOL_WHILE_WORK_RUNS],
  [SUBSESSIONS_ARE_DELEGATES, RECURRING_WORK_IS_SCHEDULED],
];

export function withForkOrchestrationRules(sections: ReadonlyArray<string>): ReadonlyArray<string> {
  return sections.map((section, index) =>
    [section, ...(FORK_RULES_BY_SECTION[index] ?? [])].join("\n"),
  );
}
