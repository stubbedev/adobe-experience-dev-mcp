import type { JsonSchema } from "./types.js";

type ObjectSchemaOptions = {
  minProperties?: number;
  maxProperties?: number;
  description?: string;
};

type StringSchemaOptions = {
  enum?: string[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  format?: string;
};

type NumberSchemaOptions = {
  minimum?: number;
  maximum?: number;
  integer?: boolean;
};

type ArraySchemaOptions = {
  minItems?: number;
  maxItems?: number;
};

export function objectSchema(
  properties: Record<string, JsonSchema>,
  required: string[] = [],
  additionalProperties: boolean | JsonSchema = false,
  options: ObjectSchemaOptions = {}
): JsonSchema {
  return {
    type: "object",
    properties,
    required,
    additionalProperties,
    ...options,
  };
}

export function stringSchema(description: string, options: StringSchemaOptions = {}): JsonSchema {
  return {
    type: "string",
    description,
    ...options,
  };
}

export function numberSchema(description: string, options: NumberSchemaOptions = {}): JsonSchema {
  const { integer = false, ...rest } = options;
  return {
    type: integer ? "integer" : "number",
    description,
    ...rest,
  };
}

export function booleanSchema(description: string): JsonSchema {
  return { type: "boolean", description };
}

export function arraySchema(description: string, items: JsonSchema, options: ArraySchemaOptions = {}): JsonSchema {
  return {
    type: "array",
    description,
    items,
    ...options,
  };
}
