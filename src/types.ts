import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export type JsonObject = Record<string, unknown>;
export type JsonSchema = Record<string, unknown>;

export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  inputSchema: JsonSchema;
  handler: (args: JsonObject) => Promise<unknown> | unknown;
}

export interface CategoryDefinition {
  name: string;
  description: string;
}
