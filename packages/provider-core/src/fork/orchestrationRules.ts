import { agentLanguageLine, forkAgentLanguage, forkFeatureActive } from "@t3tools/contracts";

import {
  T3_CODE_ORCHESTRATION_INSTRUCTIONS,
  t3CodeOrchestrationSections,
} from "../server/orchestrationInstructions.ts";

const WORKFLOW_RULE = " Workflow only when asked.";

const LISTED_CHILD_FOR_A_THREAD_APART =
  " A thread the user asked to run apart: `delegate_task` with `listed:true`, so it gets a sidebar row.";

const LISTED_CHILD_WAITS_FOR_THE_USER =
  "- In a `listed:true` child's `task`, say it waits for the user's order before it changes files or opens a PR, unless you quote that order.";

const ASK_THROUGH_THE_QUESTION_TOOL_WHILE_WORK_RUNS =
  "- While a delegate or background task runs, ask for what you need from the user (an answer, an ok, an action) with your question tool (Claude `AskUserQuestion`, Codex `request_user_input`), not only in your reply: until a question opens, the thread stays under Working, where the user does not look. A status that needs nothing from the user stays a plain reply. If the tool is unavailable, ask in the reply.";

export const REQUEST_ATTENTION_WHEN_THE_NEXT_STEP_IS_THE_USERS =
  "- When the next step is the user's (an answer, an ok, an action), put the request in your reply, call `t3_request_attention` with one line on what they must do, and end your turn. It takes the thread out of Working and notifies the user, with no form. A status that needs nothing from the user stays a plain reply.";

const SUBSESSIONS_ARE_DELEGATES =
  '- "Session", "subsession" or "thread for each X" means a `delegate_task` child.';

const RECURRING_WORK_IS_SCHEDULED = "- Recurring or timed work: `schedule_task`, not `CronCreate`.";

export const GOAL_WAITS_ON_THE_USER =
  "- A `/goal` that waits on something only the user can do, or whose criterion cannot become true as written: call `t3_goal_update`. Never repeat the request in each reply.";

interface RuleFeatures {
  readonly goalStatus: boolean;
  readonly requestAttention: boolean;
}

function forkRulesBySection(features: RuleFeatures): ReadonlyArray<ReadonlyArray<string>> {
  return [
    [
      LISTED_CHILD_WAITS_FOR_THE_USER,
      features.requestAttention
        ? REQUEST_ATTENTION_WHEN_THE_NEXT_STEP_IS_THE_USERS
        : ASK_THROUGH_THE_QUESTION_TOOL_WHILE_WORK_RUNS,
      ...(features.goalStatus ? [GOAL_WAITS_ON_THE_USER] : []),
    ],
    [SUBSESSIONS_ARE_DELEGATES, RECURRING_WORK_IS_SCHEDULED],
  ];
}

const upstreamSections = new Map<boolean, ReadonlyArray<string>>();

function upstreamOrchestrationSections(nativeSubagents = true): ReadonlyArray<string> {
  const cached = upstreamSections.get(nativeSubagents);
  if (cached !== undefined) return cached;
  const sections = t3CodeOrchestrationSections(nativeSubagents);
  upstreamSections.set(nativeSubagents, sections);
  return sections;
}

function withForkRulesInSections(
  sections: ReadonlyArray<string>,
  features: RuleFeatures,
): ReadonlyArray<string> {
  const rulesBySection = forkRulesBySection(features);
  return sections.map((section, index) =>
    [
      section.replace(WORKFLOW_RULE, () => LISTED_CHILD_FOR_A_THREAD_APART + WORKFLOW_RULE),
      ...(rulesBySection[index] ?? []),
    ].join("\n"),
  );
}

const withRules = new Map<string, { sections: ReadonlyArray<string>; instructions: string }>();

function withForkRules(nativeSubagents: boolean) {
  const features: RuleFeatures = {
    goalStatus: forkFeatureActive("goalStatus"),
    requestAttention: forkFeatureActive("requestAttention"),
  };
  const key = `${nativeSubagents}:${features.goalStatus}:${features.requestAttention}`;
  const cached = withRules.get(key);
  if (cached !== undefined) return cached;
  const sections = withForkRulesInSections(
    upstreamOrchestrationSections(nativeSubagents),
    features,
  );
  const instructionSections = upstreamOrchestrationSections();
  const forkInstructionSections = withForkRulesInSections(instructionSections, features);
  const instructions = instructionSections.reduce(
    (text, section, index) => text.replace(section, () => forkInstructionSections[index]!),
    T3_CODE_ORCHESTRATION_INSTRUCTIONS,
  );
  const built = { sections, instructions };
  withRules.set(key, built);
  return built;
}

function agentLanguageSection(): string | undefined {
  const language = forkAgentLanguage();
  return language === ""
    ? undefined
    : `### Language\n\n- ${agentLanguageLine(language)} This holds for every reply, also after a notification, a compaction, a goal continuation, or long output in another language.`;
}

export function forkOrchestrationSections(nativeSubagents = true): ReadonlyArray<string> {
  const sections = forkFeatureActive("orchestrationRules")
    ? withForkRules(nativeSubagents).sections
    : upstreamOrchestrationSections(nativeSubagents);
  const language = agentLanguageSection();
  return language === undefined ? sections : [...sections, language];
}

export function forkOrchestrationInstructions(): string {
  const instructions = forkFeatureActive("orchestrationRules")
    ? withForkRules(true).instructions
    : T3_CODE_ORCHESTRATION_INSTRUCTIONS;
  const language = agentLanguageSection();
  return language === undefined ? instructions : `${instructions}\n${language}\n`;
}
