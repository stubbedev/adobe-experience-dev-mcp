import type { ToolDefinition } from "./types.js";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  public loadedCategories = new Set<string>();

  registerCategory(categoryName: string, categoryTools: ToolDefinition[]): string[] {
    const newToolNames: string[] = [];

    for (const tool of categoryTools) {
      this.tools.set(tool.name, tool);
      newToolNames.push(tool.name);
    }

    this.loadedCategories.add(categoryName);
    return newToolNames;
  }

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(categoryName: string): ToolDefinition[] {
    return this.getAll().filter((tool) => tool.category === categoryName);
  }
}
