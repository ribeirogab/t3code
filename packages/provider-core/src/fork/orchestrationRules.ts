const LISTED_CHILD_WAITS_FOR_THE_USER =
  "- In a `listed:true` child's `task`, say it waits for the user's order before it changes files or opens a PR, unless you quote that order.";

const SUBSESSIONS_ARE_DELEGATES =
  '- "Session", "subsession" or "thread for each X" means a `delegate_task` child.';

const RECURRING_WORK_IS_SCHEDULED = "- Recurring or timed work: `schedule_task`, not `CronCreate`.";

const FORK_RULES_BY_SECTION: ReadonlyArray<ReadonlyArray<string>> = [
  [LISTED_CHILD_WAITS_FOR_THE_USER],
  [SUBSESSIONS_ARE_DELEGATES, RECURRING_WORK_IS_SCHEDULED],
];

export function withForkOrchestrationRules(sections: ReadonlyArray<string>): ReadonlyArray<string> {
  return sections.map((section, index) =>
    [section, ...(FORK_RULES_BY_SECTION[index] ?? [])].join("\n"),
  );
}
