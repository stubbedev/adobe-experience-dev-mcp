import type { JsonSchema } from "./types.js";

export function objectSchema(
  properties: Record<string, JsonSchema>,
  required: string[] = [],
  additionalProperties: boolean | JsonSchema = false
): JsonSchema {
  return {
    type: "object",
    properties,
    required,
    additionalProperties,
  };
}

export function stringSchema(description: string): JsonSchema {
  return { type: "string", description };
}

export function numberSchema(description: string): JsonSchema {
  return { type: "number", description };
}

export function booleanSchema(description: string): JsonSchema {
  return { type: "boolean", description };
}

export function arraySchema(description: string, items: JsonSchema): JsonSchema {
  return {
    type: "array",
    description,
    items,
  };
}
