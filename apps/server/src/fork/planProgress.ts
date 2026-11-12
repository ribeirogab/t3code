import type { OrchestrationV2PlanStep, OrchestrationV2ThreadShell } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as SqlClient from "effect/sql/SqlClient";
import type * as Statement from "effect/sql/Statement";

type ForkPlanProgress = NonNullable<OrchestrationV2ThreadShell["forkPlanProgress"]>;

type PlanStepSummary = Pick<OrchestrationV2PlanStep, "text" | "status">;

const NEXT_STEP_MAX_LENGTH = 200;

export function forkPlanProgressFromSteps(
  steps: ReadonlyArray<PlanStepSummary>,
): ForkPlanProgress | null {
  if (steps.length === 0) return null;
  const next =
    steps.find((step) => step.status === "running") ??
    steps.find((step) => step.status === "pending");
  return {
    done: steps.filter((step) => step.status === "completed").length,
    total: steps.length,
    next: next === undefined ? null : next.text.slice(0, NEXT_STEP_MAX_LENGTH),
  };
}

const decodeStepsJson = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Array(
      Schema.Struct({
        text: Schema.String,
        status: Schema.Literals(["pending", "running", "completed"]),
      }),
    ),
  ),
);

export function forkPlanProgressFromStepsJson(json: string | null): ForkPlanProgress | null {
  if (json === null) return null;
  return Option.match(decodeStepsJson(json), {
    onNone: () => null,
    onSome: forkPlanProgressFromSteps,
  });
}

export const forkLatestTodoListStepsColumn = (
  sql: SqlClient.SqlClient,
  threadIdColumn: Statement.Fragment,
) => sql`(
  SELECT json_extract(plan.payload_json, '$.steps')
  FROM orchestration_v2_projection_plans plan
  WHERE plan.thread_id = ${threadIdColumn}
    AND plan.kind = 'todo_list'
    AND plan.status <> 'superseded'
  ORDER BY plan.rowid DESC
  LIMIT 1
) AS fork_todo_list_steps_json`;
