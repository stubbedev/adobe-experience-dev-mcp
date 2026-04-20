import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ToolRegistry } from "../registry.js";
import { AdobeExperienceDevMcpServer } from "../server.js";
import type { ToolDefinition } from "../types.js";
import { toolFixtures } from "../testing/tool-fixtures.js";

function getRegistry(server: AdobeExperienceDevMcpServer): ToolRegistry {
  return (server as unknown as { registry: ToolRegistry }).registry;
}

function loadAllCategories(server: AdobeExperienceDevMcpServer): void {
  server.loadAllCategoriesForTesting();
}

function assertToolResponseShape(tool: ToolDefinition, response: unknown): void {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    assert.fail(`Tool '${tool.name}' returned a non-object response.`);
  }

  const result = response as Record<string, unknown>;

  if (typeof result.method === "string") {
    assert.equal(typeof result.endpoint, "string", `${tool.name}: endpoint should be a string`);
    assert.equal(typeof result.headers, "object", `${tool.name}: headers should be an object`);

    if (result.fieldCitations !== undefined) {
      assert.ok(Array.isArray(result.fieldCitations), `${tool.name}: fieldCitations should be an array when provided`);
    }
  }

  if (tool.name.startsWith("aem_explain_")) {
    assert.equal(typeof result.text, "string", `${tool.name}: text should be present`);
  }
}

test("all tools return regression-safe shape with fixtures", async () => {
  const server = new AdobeExperienceDevMcpServer("test-regression");
  const registry = getRegistry(server);

  loadAllCategories(server);

  const allTools = registry.getAll();
  assert.ok(allTools.length > 20, "expected all core + category tools to be registered");

  for (const tool of allTools) {
    const args = toolFixtures[tool.name] ?? {};
    const result = await tool.handler(args);
    assertToolResponseShape(tool, result);
  }
});

test("operation preset output matches golden fixtures", async () => {
  const server = new AdobeExperienceDevMcpServer("test-golden");
  const registry = getRegistry(server);
  const presetTool = registry.get("aem_get_operation_preset");

  assert.ok(presetTool, "aem_get_operation_preset tool should exist");

  for (const presetName of ["bulk_migration", "nightly_delta_sync", "cms_publish_sync"]) {
    const goldenPath = path.resolve(process.cwd(), `src/tests/golden/${presetName}.json`);
    const goldenRaw = await readFile(goldenPath, "utf8");
    const golden = JSON.parse(goldenRaw) as {
      presetName: string;
      requiredSteps: string[];
      recommendedSteps: string[];
      requiredSafeguards: string[];
      orderedPlanStepIds: string[];
    };

    const response = await presetTool.handler({ presetName });
    assert.ok(response && typeof response === "object" && !Array.isArray(response));
    const result = response as Record<string, unknown>;

    const orderedPlan = result.orderedPlan as Array<{ stepId: string }>;
    const orderedPlanStepIds = orderedPlan.map((step) => step.stepId);

    assert.deepEqual(
      {
        presetName: result.presetName,
        requiredSteps: result.requiredSteps,
        recommendedSteps: result.recommendedSteps,
        requiredSafeguards: result.requiredSafeguards,
        orderedPlanStepIds,
      },
      golden,
      `Preset '${presetName}' diverged from golden fixture`
    );
  }
});
