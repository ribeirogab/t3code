import { forkFeatureActive } from "@t3tools/contracts";

import {
  T3_CODE_ORCHESTRATION_INSTRUCTIONS,
  T3_CODE_ORCHESTRATION_SECTIONS,
} from "../server/orchestrationInstructions.ts";

const BACKGROUND_AGENT_RULE = "Background agent: `delegate_task`, never a background `Agent`.";

const LISTED_CHILD_FOR_A_THREAD_APART =
  " A thread the user asked to run apart: `delegate_task` with `listed:true`, so it gets a sidebar row.";

const LISTED_CHILD_WAITS_FOR_THE_USER =
  "- In a `listed:true` child's `task`, say it waits for the user's order before it changes files or opens a PR, unless you quote that order.";

const ASK_THROUGH_THE_QUESTION_TOOL_WHILE_WORK_RUNS =
  "- While a delegate or background task runs, ask for what you need from the user (an answer, an ok, an action) with your question tool (Claude `AskUserQuestion`, Codex `request_user_input`), not only in your reply: until a question opens, the thread stays under Working, where the user does not look. A status that needs nothing from the user stays a plain reply. If the tool is unavailable, ask in the reply.";

const SUBSESSIONS_ARE_DELEGATES =
  '- "Session", "subsession" or "thread for each X" means a `delegate_task` child.';

const RECURRING_WORK_IS_SCHEDULED = "- Recurring or timed work: `schedule_task`, not `CronCreate`.";

export const GOAL_WAITS_ON_THE_USER =
  "- A `/goal` that waits on something only the user can do, or whose criterion cannot become true as written: call `t3_goal_update`. Never repeat the request in each reply.";

function forkRulesBySection(goalStatus: boolean): ReadonlyArray<ReadonlyArray<string>> {
  return [
    [
      LISTED_CHILD_WAITS_FOR_THE_USER,
      ASK_THROUGH_THE_QUESTION_TOOL_WHILE_WORK_RUNS,
      ...(goalStatus ? [GOAL_WAITS_ON_THE_USER] : []),
    ],
    [SUBSESSIONS_ARE_DELEGATES, RECURRING_WORK_IS_SCHEDULED],
  ];
}

const withRules = new Map<boolean, { sections: ReadonlyArray<string>; instructions: string }>();

function withForkRules() {
  const goalStatus = forkFeatureActive("goalStatus");
  const cached = withRules.get(goalStatus);
  if (cached !== undefined) return cached;
  const rulesBySection = forkRulesBySection(goalStatus);
  const sections = T3_CODE_ORCHESTRATION_SECTIONS.map((section, index) =>
    [
      section.replace(
        BACKGROUND_AGENT_RULE,
        () => BACKGROUND_AGENT_RULE + LISTED_CHILD_FOR_A_THREAD_APART,
      ),
      ...(rulesBySection[index] ?? []),
    ].join("\n"),
  );
  const instructions = T3_CODE_ORCHESTRATION_SECTIONS.reduce(
    (text, section, index) => text.replace(section, () => sections[index]!),
    T3_CODE_ORCHESTRATION_INSTRUCTIONS,
  );
  const built = { sections, instructions };
  withRules.set(goalStatus, built);
  return built;
}

export function forkOrchestrationSections(): ReadonlyArray<string> {
  return forkFeatureActive("orchestrationRules")
    ? withForkRules().sections
    : T3_CODE_ORCHESTRATION_SECTIONS;
}

export function forkOrchestrationInstructions(): string {
  return forkFeatureActive("orchestrationRules")
    ? withForkRules().instructions
    : T3_CODE_ORCHESTRATION_INSTRUCTIONS;
}
