import { ToolRegistry } from "../registry.js";
import { AdobeExperienceDevMcpServer } from "../server.js";
import type { ToolDefinition } from "../types.js";
import { endpointEvalCases, routingEvalPrompts, toolFixtures } from "../testing/tool-fixtures.js";

function getRegistry(server: AdobeExperienceDevMcpServer): ToolRegistry {
  return (server as unknown as { registry: ToolRegistry }).registry;
}

function requiredFields(tool: ToolDefinition): string[] {
  const schema = tool.inputSchema as Record<string, unknown>;
  const required = schema.required;
  return Array.isArray(required) ? required.filter((item): item is string => typeof item === "string") : [];
}

async function main(): Promise<void> {
  const server = new AdobeExperienceDevMcpServer("eval-accuracy");
  const registry = getRegistry(server);

  server.loadAllCategoriesForTesting();

  const searchTool = registry.get("search_aem_assets_api");
  if (!searchTool) {
    throw new Error("search_aem_assets_api tool is not registered.");
  }

  let routingMatches = 0;
  let routingTotal = 0;
  const routingDetails: Array<{ query: string; expected: string; got: string | null; confidence: number }> = [];

  for (const testCase of routingEvalPrompts) {
    routingTotal += 1;
    const raw = await searchTool.handler({ query: testCase.query, semanticRerank: true, maxResults: 5 });
    const result = raw as Record<string, unknown>;
    const got = typeof result.suggestedTool === "string" ? result.suggestedTool : null;
    const confidence = typeof result.confidence === "number" ? result.confidence : 0;

    if (got === testCase.expectedTool) {
      routingMatches += 1;
    }

    routingDetails.push({
      query: testCase.query,
      expected: testCase.expectedTool,
      got,
      confidence,
    });
  }

  let requiredParamsSatisfied = 0;
  let requiredParamsTotal = 0;
  let endpointMatches = 0;
  let endpointTotal = 0;
  const endpointDetails: Array<{
    toolName: string;
    requiredMissing: string[];
    endpointPass: boolean;
    endpoint: string | null;
  }> = [];

  for (const endpointCase of endpointEvalCases) {
    const tool = registry.get(endpointCase.toolName);
    if (!tool) {
      throw new Error(`Tool '${endpointCase.toolName}' is not registered.`);
    }

    const args = toolFixtures[endpointCase.toolName] ?? {};
    const required = requiredFields(tool);
    const missingRequired = required.filter((field) => args[field] === undefined || args[field] === null);

    requiredParamsTotal += required.length;
    requiredParamsSatisfied += required.length - missingRequired.length;

    endpointTotal += 1;

    let endpointPass = false;
    let endpointValue: string | null = null;

    try {
      const raw = await tool.handler(args);
      const result = raw as Record<string, unknown>;
      endpointValue = typeof result.endpoint === "string" ? result.endpoint : null;
      endpointPass = endpointValue !== null && endpointValue.includes(endpointCase.expectedContains);
    } catch {
      endpointPass = false;
    }

    if (endpointPass) {
      endpointMatches += 1;
    }

    endpointDetails.push({
      toolName: endpointCase.toolName,
      requiredMissing: missingRequired,
      endpointPass,
      endpoint: endpointValue,
    });
  }

  const routingAccuracy = routingTotal === 0 ? 0 : routingMatches / routingTotal;
  const requiredParamCoverage = requiredParamsTotal === 0 ? 0 : requiredParamsSatisfied / requiredParamsTotal;
  const endpointAccuracy = endpointTotal === 0 ? 0 : endpointMatches / endpointTotal;

  const summary = {
    thresholds: {
      routingAccuracy: 0.85,
      requiredParamCoverage: 1,
      endpointAccuracy: 0.95,
    },
    metrics: {
      routingAccuracy: Number(routingAccuracy.toFixed(3)),
      requiredParamCoverage: Number(requiredParamCoverage.toFixed(3)),
      endpointAccuracy: Number(endpointAccuracy.toFixed(3)),
    },
    routingDetails,
    endpointDetails,
  };

  console.log(JSON.stringify(summary, null, 2));

  const fail =
    routingAccuracy < summary.thresholds.routingAccuracy ||
    requiredParamCoverage < summary.thresholds.requiredParamCoverage ||
    endpointAccuracy < summary.thresholds.endpointAccuracy;

  if (fail) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("accuracy harness failed:", error);
  process.exit(1);
});
