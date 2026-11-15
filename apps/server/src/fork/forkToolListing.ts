import {
  forkFeatureActive,
  onForkFeatureSettingsChange,
  type ForkServerFeature,
} from "@t3tools/contracts";
import { McpSchema, type McpServer } from "effect/ai";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";

import { FORK_PARAMETERS } from "./forkToolGates.ts";

interface ForkToolPart {
  readonly feature: ForkServerFeature;
  readonly description?: readonly [upstream: string, fork: string];
  readonly inputProperties?: ReadonlyArray<string>;
  readonly enumValues?: ReadonlyArray<readonly [property: string, value: string]>;
  readonly optionalOutputProperties?: ReadonlyArray<string>;
  readonly outputUnionMembers?: ReadonlyArray<string>;
}

const FORK_TOOL_PARTS: Readonly<Record<string, ReadonlyArray<ForkToolPart>>> = {
  delegate_task: [
    {
      feature: "nestedThreads",
      description: [
        "`isolation:'worktree'`. ",
        "`isolation:'worktree'`. A thread the user asked for gets a sidebar row: `listed:true`. ",
      ],
    },
    {
      feature: "quietParentWake",
      description: [
        " Keep `taskId`",
        " `notifyParent` limits which child events wake you. Keep `taskId`",
      ],
    },
  ],
  t3_thread_update: [
    {
      feature: "nestedThreads",
      description: [
        "(`action:'rename'` with `title`) or regenerate its title.",
        "(`action:'rename'` with `title`), regenerate its title, or show or hide a child thread in the sidebar when the user asks (`action:'set_listed'` with `listed`).",
      ],
      enumValues: [["action", "set_listed"]],
    },
  ],
  t3_thread_send: [
    {
      feature: "quietThreadSend",
      enumValues: [["delivery", "held"]],
      optionalOutputProperties: ["runId", "status"],
    },
  ],
  t3_thread_organize: [
    { feature: "archiveAfterTurn", outputUnionMembers: ["archivesWhenTurnEnds"] },
  ],
};

type JsonObject = { readonly [key: string]: unknown };

const toolParts = (toolName: string): ReadonlyArray<ForkToolPart> => [
  ...(FORK_TOOL_PARTS[toolName] ?? []),
  ...(FORK_PARAMETERS[toolName] ?? []).map(([parameter, feature]) => ({
    feature,
    inputProperties: [parameter],
  })),
];

const objectProperties = (schema: JsonObject): JsonObject | undefined =>
  Predicate.isObject(schema.properties) ? schema.properties : undefined;

const requiredNames = (schema: JsonObject): ReadonlyArray<unknown> =>
  Array.isArray(schema.required) ? schema.required : [];

function withoutProperties<Json extends JsonObject>(
  schema: Json,
  names: ReadonlyArray<string> = [],
): Json {
  const properties = objectProperties(schema);
  if (names.length === 0 || properties === undefined) return schema;
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(properties).filter(([name]) => !names.includes(name)),
    ),
    ...(Array.isArray(schema.required)
      ? { required: requiredNames(schema).filter((name) => !names.includes(String(name))) }
      : {}),
  };
}

function withoutEnumValues<Json extends JsonObject>(
  schema: Json,
  values: ForkToolPart["enumValues"] = [],
): Json {
  const properties = objectProperties(schema);
  if (values.length === 0 || properties === undefined) return schema;
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(properties).map(([name, property]) => {
        const removed = values.filter(([target]) => target === name).map(([, value]) => value);
        if (
          removed.length === 0 ||
          !Predicate.isObject(property) ||
          !Array.isArray(property.enum)
        ) {
          return [name, property];
        }
        return [
          name,
          { ...property, enum: property.enum.filter((entry) => !removed.includes(entry)) },
        ];
      }),
    ),
  };
}

const withoutNull = (schema: unknown): unknown => {
  if (!Predicate.isObject(schema) || !Array.isArray(schema.anyOf)) return schema;
  const kept = schema.anyOf.filter(
    (member) => !(Predicate.isObject(member) && member.type === "null"),
  );
  return kept.length === 1 ? kept[0] : schema;
};

function withRequiredProperties<Json extends JsonObject>(
  schema: Json,
  names: ReadonlyArray<string> = [],
): Json {
  const properties = objectProperties(schema);
  if (names.length === 0 || properties === undefined) return schema;
  const required = requiredNames(schema);
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(properties).map(([name, property]) =>
        names.includes(name) ? [name, withoutNull(property)] : [name, property],
      ),
    ),
    required: Object.keys(properties).filter(
      (name) => required.includes(name) || names.includes(name),
    ),
  };
}

function withoutUnionMembers<Json extends JsonObject>(
  schema: Json,
  properties: ReadonlyArray<string> = [],
): Json {
  if (properties.length === 0 || !Array.isArray(schema.anyOf)) return schema;
  return {
    ...schema,
    anyOf: schema.anyOf.filter((member) => {
      const memberProperties = Predicate.isObject(member) ? objectProperties(member) : undefined;
      return !properties.some((property) => memberProperties?.[property] !== undefined);
    }),
  };
}

const inputWithoutPart = (schema: McpSchema.ToolJson, part: ForkToolPart) =>
  withoutEnumValues(withoutProperties(schema, part.inputProperties), part.enumValues);

const outputWithoutPart = (schema: McpSchema.ToolOutputJson, part: ForkToolPart) =>
  withoutUnionMembers(
    withRequiredProperties(
      withoutEnumValues(schema, part.enumValues),
      part.optionalOutputProperties,
    ),
    part.outputUnionMembers,
  );

function forkToolDefinition(tool: McpSchema.Tool): McpSchema.Tool {
  const parts = toolParts(tool.name);
  if (parts.length === 0) return tool;
  let description = tool.description;
  let inputSchema = tool.inputSchema;
  let outputSchema = tool.outputSchema;
  for (const part of parts) {
    if (forkFeatureActive(part.feature)) {
      if (part.description !== undefined) description = description?.replace(...part.description);
      continue;
    }
    inputSchema = inputWithoutPart(inputSchema, part);
    outputSchema = outputSchema === undefined ? undefined : outputWithoutPart(outputSchema, part);
  }
  return new McpSchema.Tool({ ...tool, description, inputSchema, outputSchema });
}

type ToolServer = McpServer.McpServer["Service"];
type ToolRegistration = Parameters<ToolServer["addTool"]>[0];

const isToolRegistration = (entry: object): entry is ToolRegistration =>
  "handle" in entry && Predicate.isFunction(entry.handle);

export const followForkToolListing = Effect.fn("fork.followForkToolListing")(function* (
  tools: ToolServer["tools"],
  register: (registration: ToolRegistration) => Effect.Effect<void>,
) {
  const registrations = tools
    .filter((entry) => toolParts(entry.tool.name).length > 0)
    .filter(isToolRegistration);
  const listed = new Map(registrations.map(({ tool }) => [tool.name, JSON.stringify(tool)]));
  const relist = Effect.forEach(
    registrations,
    (registration) => {
      const tool = forkToolDefinition(registration.tool);
      const definition = JSON.stringify(tool);
      if (listed.get(tool.name) === definition) return Effect.void;
      listed.set(tool.name, definition);
      return register({ ...registration, tool });
    },
    { discard: true },
  );
  yield* relist;
  const services = yield* Effect.context<never>();
  yield* Effect.acquireDisposable(
    Effect.sync(() => onForkFeatureSettingsChange(() => Effect.runForkWith(services)(relist))),
  );
});
