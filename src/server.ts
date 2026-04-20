import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolRegistry } from "./registry.js";
import { assetsTools, foldersTools, metadataTools, renditionsTools, searchTools, uploadsTools } from "./categories/index.js";
import { arraySchema, booleanSchema, objectSchema, stringSchema } from "./schemas.js";
import type { CategoryDefinition, JsonObject, ToolDefinition } from "./types.js";
import { assertRecord, stringifyResponsePayload } from "./utils.js";

type SearchEntry = {
  keywords: string[];
  category: string;
  tool: string;
  endpointHint: string;
  description: string;
  docsUrl: string;
};

type IntegrationPreset = {
  id: string;
  title: string;
  useCase: string;
  description: string;
  requiredSteps: string[];
  recommendedSteps: string[];
  requiredSafeguards: string[];
  plan: Array<{
    stepId: string;
    objective: string;
    category: string;
    tool: string;
    expectedOutcome: string;
    why: string;
  }>;
  antiPatterns: string[];
  docs: Record<string, string>;
};

const KNOWN_SAFEGUARDS = [
  "retry_backoff",
  "idempotency_keys",
  "checkpoints",
  "bounded_concurrency",
  "structured_logging",
] as const;

const STEP_TOOL_MAP: Record<string, string> = {
  discover_assets_baseline: "aem_search_query_builder_assets",
  discover_assets_delta_window: "aem_search_query_builder_delta_window",
  ensure_folders: "aem_folders_create",
  initiate_upload: "aem_upload_initiate",
  upload_binary_parts: "aem_upload_plan_parts",
  complete_upload: "aem_upload_complete",
  sync_metadata: "aem_metadata_build_sync_manifest",
  sync_renditions: "aem_renditions_update",
  verify_asset_state: "aem_assets_get",
  archive_or_move_assets: "aem_assets_move",
};

const INTEGRATION_PRESETS: Record<string, IntegrationPreset> = {
  bulk_migration: {
    id: "bulk_migration",
    title: "Bulk Migration",
    useCase: "One-time or phased migration of large legacy libraries into AEM DAM.",
    description:
      "Optimized for high-volume import with strict replayability. Prioritizes deterministic uploads, metadata consistency, and recoverability.",
    requiredSteps: [
      "discover_assets_baseline",
      "ensure_folders",
      "initiate_upload",
      "upload_binary_parts",
      "complete_upload",
      "sync_metadata",
      "verify_asset_state",
    ],
    recommendedSteps: ["sync_renditions", "archive_or_move_assets"],
    requiredSafeguards: [
      "retry_backoff",
      "idempotency_keys",
      "checkpoints",
      "bounded_concurrency",
      "structured_logging",
    ],
    plan: [
      {
        stepId: "discover_assets_baseline",
        objective: "Inventory source and target assets before migration batches.",
        category: "search",
        tool: "aem_search_query_builder_assets",
        expectedOutcome: "Deterministic source-to-target migration manifest with paging checkpoints.",
        why: "Prevents blind writes and supports idempotent reruns.",
      },
      {
        stepId: "ensure_folders",
        objective: "Create DAM structure ahead of upload workers.",
        category: "folders",
        tool: "aem_folders_create",
        expectedOutcome: "Stable folder tree with 409 treated as idempotent success.",
        why: "Avoids upload initiation failures due to missing paths.",
      },
      {
        stepId: "initiate_upload",
        objective: "Start direct binary upload session per asset.",
        category: "uploads",
        tool: "aem_upload_initiate",
        expectedOutcome: "completeURI + uploadToken + uploadURIs captured per file.",
        why: "Required contract for cloud-safe original binary ingest.",
      },
      {
        stepId: "upload_binary_parts",
        objective: "Upload content bytes with server-provided part boundaries.",
        category: "uploads",
        tool: "aem_upload_plan_parts",
        expectedOutcome: "All binary parts uploaded respecting minPartSize/maxPartSize.",
        why: "Eliminates chunk-size guesswork that causes upload failures.",
      },
      {
        stepId: "complete_upload",
        objective: "Finalize upload and trigger AEM processing.",
        category: "uploads",
        tool: "aem_upload_complete",
        expectedOutcome: "Asset ingestion committed and traceable.",
        why: "Upload is not complete until completeURI is called.",
      },
      {
        stepId: "sync_metadata",
        objective: "Apply mapped metadata consistently at scale.",
        category: "metadata",
        tool: "aem_metadata_build_sync_manifest",
        expectedOutcome: "Batch-safe metadata operations with replay-ready failure slices.",
        why: "Keeps taxonomy and searchability correct after binary ingest.",
      },
      {
        stepId: "verify_asset_state",
        objective: "Read back final asset state for validation.",
        category: "assets",
        tool: "aem_assets_get",
        expectedOutcome: "Verified post-migration evidence per asset set.",
        why: "Confirms final consistency before cutover.",
      },
    ],
    antiPatterns: [
      "Uploading originals through deprecated non-direct binary flows in cloud service.",
      "Skipping complete upload call and assuming PUT to uploadURI is sufficient.",
      "Running unbounded parallel uploads without checkpointing.",
    ],
    docs: {
      uploadFlow:
        "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/developer-reference-material-apis#asset-upload",
      assetsApi:
        "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets",
    },
  },
  nightly_delta_sync: {
    id: "nightly_delta_sync",
    title: "Nightly Delta Sync",
    useCase: "Recurring synchronization for changed assets and metadata from upstream systems.",
    description:
      "Optimized for change windows and checkpoint-driven execution. Focuses on changed records only and deterministic replay.",
    requiredSteps: [
      "discover_assets_delta_window",
      "ensure_folders",
      "initiate_upload",
      "upload_binary_parts",
      "complete_upload",
      "sync_metadata",
      "verify_asset_state",
    ],
    recommendedSteps: ["sync_renditions"],
    requiredSafeguards: ["retry_backoff", "idempotency_keys", "checkpoints", "bounded_concurrency", "structured_logging"],
    plan: [
      {
        stepId: "discover_assets_delta_window",
        objective: "Identify assets changed within last sync window.",
        category: "search",
        tool: "aem_search_query_builder_delta_window",
        expectedOutcome: "Stable ordered change set keyed by modified timestamps.",
        why: "Reduces volume and supports restart from checkpoint boundaries.",
      },
      {
        stepId: "ensure_folders",
        objective: "Provision missing target folders for changed content.",
        category: "folders",
        tool: "aem_folders_create",
        expectedOutcome: "No upload failures due to missing DAM paths.",
        why: "Delta feeds often include new structures unexpectedly.",
      },
      {
        stepId: "initiate_upload",
        objective: "Initiate upload only for changed/new binaries.",
        category: "uploads",
        tool: "aem_upload_initiate",
        expectedOutcome: "Targeted upload sessions for delta subset.",
        why: "Avoids unnecessary binary churn on unchanged assets.",
      },
      {
        stepId: "upload_binary_parts",
        objective: "Upload binaries using returned constraints.",
        category: "uploads",
        tool: "aem_upload_plan_parts",
        expectedOutcome: "Predictable chunking behavior across nightly jobs.",
        why: "Prevents intermittent failures caused by invalid part sizing.",
      },
      {
        stepId: "complete_upload",
        objective: "Complete uploads for all changed binaries.",
        category: "uploads",
        tool: "aem_upload_complete",
        expectedOutcome: "Committed nightly binary updates.",
        why: "Completes processing lifecycle per changed asset.",
      },
      {
        stepId: "sync_metadata",
        objective: "Apply metadata deltas from source of truth.",
        category: "metadata",
        tool: "aem_metadata_build_sync_manifest",
        expectedOutcome: "Metadata parity for changed assets.",
        why: "Nightly pipelines must keep search and governance fields current.",
      },
      {
        stepId: "verify_asset_state",
        objective: "Validate post-sync state and persist checkpoint.",
        category: "assets",
        tool: "aem_assets_get",
        expectedOutcome: "Auditable sync completion and next-window checkpoint.",
        why: "Guarantees resumable nightly operations.",
      },
    ],
    antiPatterns: [
      "Re-syncing the full DAM on every run instead of timestamp windows.",
      "Advancing checkpoints before verification completes.",
      "Ignoring partial failures and marking job success globally.",
    ],
    docs: {
      queryBuilder:
        "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/full-stack/search/query-builder-api",
      uploadFlow:
        "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/developer-reference-material-apis#asset-upload",
    },
  },
  cms_publish_sync: {
    id: "cms_publish_sync",
    title: "CMS Publish Sync",
    useCase: "Continuous sync from CMS publication events into DAM-ready structures and derivatives.",
    description:
      "Optimized for low-latency publish pipelines where originals, metadata, and web renditions must remain consistent.",
    requiredSteps: [
      "ensure_folders",
      "initiate_upload",
      "upload_binary_parts",
      "complete_upload",
      "sync_metadata",
      "sync_renditions",
      "verify_asset_state",
    ],
    recommendedSteps: ["archive_or_move_assets"],
    requiredSafeguards: ["retry_backoff", "idempotency_keys", "bounded_concurrency", "structured_logging"],
    plan: [
      {
        stepId: "ensure_folders",
        objective: "Guarantee publish target path exists before writing assets.",
        category: "folders",
        tool: "aem_folders_create",
        expectedOutcome: "Publish path stability for event-driven writes.",
        why: "Prevents event drops due to missing paths.",
      },
      {
        stepId: "initiate_upload",
        objective: "Initiate original upload for published media.",
        category: "uploads",
        tool: "aem_upload_initiate",
        expectedOutcome: "Upload contract generated per publish event.",
        why: "Direct binary flow is the cloud-safe write path for originals.",
      },
      {
        stepId: "upload_binary_parts",
        objective: "Transfer original binary bytes to upload URIs.",
        category: "uploads",
        tool: "aem_upload_plan_parts",
        expectedOutcome: "Reliable part assignment for event pipeline workers.",
        why: "Maintains correctness under varied file sizes.",
      },
      {
        stepId: "complete_upload",
        objective: "Finalize ingest and trigger downstream processing.",
        category: "uploads",
        tool: "aem_upload_complete",
        expectedOutcome: "Original is persisted and processing can start.",
        why: "Completes AEM ingest transaction.",
      },
      {
        stepId: "sync_metadata",
        objective: "Set authoritative CMS metadata fields.",
        category: "metadata",
        tool: "aem_metadata_build_sync_manifest",
        expectedOutcome: "Publish metadata parity (titles, tags, ownership, locale).",
        why: "Prevents stale metadata divergence after publish.",
      },
      {
        stepId: "sync_renditions",
        objective: "Apply web-specific derivatives for delivery channels.",
        category: "renditions",
        tool: "aem_renditions_update",
        expectedOutcome: "Deterministic rendition names and binary updates.",
        why: "Keeps channel-specific media derivatives synchronized.",
      },
      {
        stepId: "verify_asset_state",
        objective: "Validate final publish-ready state.",
        category: "assets",
        tool: "aem_assets_get",
        expectedOutcome: "Post-publish verification evidence.",
        why: "Reduces downstream rendering surprises.",
      },
    ],
    antiPatterns: [
      "Treating rendition updates as optional when channel contracts depend on them.",
      "Updating metadata before upload completion when source IDs depend on final asset path.",
      "Skipping request correlation IDs in publish event traces.",
    ],
    docs: {
      assetsApi:
        "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets",
      uploadFlow:
        "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/developer-reference-material-apis#asset-upload",
    },
  },
};

const KNOWN_STEPS = Array.from(
  new Set([
    ...Object.keys(STEP_TOOL_MAP),
    ...Object.values(INTEGRATION_PRESETS).flatMap((preset) => [...preset.requiredSteps, ...preset.recommendedSteps]),
  ])
);

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`'${fieldName}' must be an array of strings.`);
  }

  const parsed = value.map((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`'${fieldName}[${index}]' must be a non-empty string.`);
    }
    return normalizeToken(item);
  });

  return Array.from(new Set(parsed));
}

function parseSafeguards(value: unknown): Record<string, boolean> {
  if (value === undefined || value === null) {
    return {};
  }

  const record = assertRecord(value, "safeguards");
  const parsed: Record<string, boolean> = {};

  for (const [key, rawValue] of Object.entries(record)) {
    const normalizedKey = normalizeToken(key);

    if (!KNOWN_SAFEGUARDS.includes(normalizedKey as (typeof KNOWN_SAFEGUARDS)[number])) {
      throw new Error(
        `'safeguards.${key}' is not supported. Supported safeguards: ${KNOWN_SAFEGUARDS.join(", ")}`
      );
    }

    if (typeof rawValue !== "boolean") {
      throw new Error(`'safeguards.${key}' must be a boolean.`);
    }

    parsed[normalizedKey] = rawValue;
  }

  return parsed;
}

function getPresetByName(rawName: string): IntegrationPreset {
  const normalized = normalizeToken(rawName);
  const preset = INTEGRATION_PRESETS[normalized];

  if (!preset) {
    throw new Error(
      `Unknown preset '${rawName}'. Available presets: ${Object.keys(INTEGRATION_PRESETS).join(", ")}`
    );
  }

  return preset;
}

const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    name: "uploads",
    description: "Direct binary upload workflow for AEM as a Cloud Service (initiate, complete, and chunk planning).",
  },
  {
    name: "folders",
    description: "Folder lifecycle operations in DAM (list, create, copy, move, delete).",
  },
  {
    name: "assets",
    description: "Asset lifecycle operations (get, copy, move, delete).",
  },
  {
    name: "metadata",
    description: "Metadata retrieval, updates, and sync manifests for bulk integration workflows.",
  },
  {
    name: "search",
    description: "Asset discovery using AEM Query Builder predicates for integration and sync pipelines.",
  },
  {
    name: "renditions",
    description: "Create, update, and delete asset renditions for transformation-driven integrations.",
  },
];

const CATEGORY_TOOL_MAP: Record<string, ToolDefinition[]> = {
  uploads: uploadsTools,
  folders: foldersTools,
  assets: assetsTools,
  metadata: metadataTools,
  search: searchTools,
  renditions: renditionsTools,
};

const SEARCH_INDEX: SearchEntry[] = [
  {
    keywords: ["upload", "binary", "initiate", "complete", "chunk", "part", "file upload"],
    category: "uploads",
    tool: "aem_upload_initiate",
    endpointHint: "/content/dam/{folder}.initiateUpload.json",
    description: "Start direct binary upload flow.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/developer-reference-material-apis#asset-upload",
  },
  {
    keywords: ["create folder", "mkdir", "directory", "folder"],
    category: "folders",
    tool: "aem_folders_create",
    endpointHint: "/api/assets/{folderPath}",
    description: "Create DAM folders for import pipelines.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#create-a-folder",
  },
  {
    keywords: ["list folder", "browse", "folder listing", "children"],
    category: "folders",
    tool: "aem_folders_list",
    endpointHint: "/api/assets/{folderPath}.json",
    description: "List assets and subfolders.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#retrieve-a-folder-listing",
  },
  {
    keywords: ["metadata", "sync metadata", "dc:title", "dc:description", "update metadata"],
    category: "metadata",
    tool: "aem_metadata_update",
    endpointHint: "/api/assets/{assetPath}",
    description: "Update metadata fields on assets.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#update-metadata-of-an-asset",
  },
  {
    keywords: ["copy", "move", "rename", "relocate"],
    category: "assets",
    tool: "aem_assets_move",
    endpointHint: "COPY/MOVE /api/assets/{path}",
    description: "Move/copy assets across folder structure.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#move-a-folder-or-an-asset",
  },
  {
    keywords: ["delete asset", "remove asset", "cleanup"],
    category: "assets",
    tool: "aem_assets_delete",
    endpointHint: "DELETE /api/assets/{assetPath}",
    description: "Delete assets from DAM.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#delete-a-folder-asset-or-rendition",
  },
  {
    keywords: ["search", "query builder", "find assets", "discover assets", "metadata filter"],
    category: "search",
    tool: "aem_search_query_builder_assets",
    endpointHint: "/bin/querybuilder.json",
    description: "Search assets using Query Builder predicates.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/full-stack/search/query-builder-api",
  },
  {
    keywords: ["incremental sync", "delta", "modified since", "last modified window"],
    category: "search",
    tool: "aem_search_query_builder_delta_window",
    endpointHint: "/bin/querybuilder.json",
    description: "Find assets modified in a timestamp window.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/full-stack/search/query-builder-api",
  },
  {
    keywords: ["rendition", "thumbnail", "web rendition", "derived binary"],
    category: "renditions",
    tool: "aem_renditions_create",
    endpointHint: "/api/assets/{assetPath}/renditions/{renditionName}",
    description: "Create rendition binaries for existing assets.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#create-an-asset-rendition",
  },
  {
    keywords: ["update rendition", "replace rendition", "refresh thumbnail"],
    category: "renditions",
    tool: "aem_renditions_update",
    endpointHint: "PUT /api/assets/{assetPath}/renditions/{renditionName}",
    description: "Replace existing rendition binaries.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#update-an-asset-rendition",
  },
  {
    keywords: ["preflight", "validate plan", "implementation checklist", "integration readiness"],
    category: "core",
    tool: "aem_validate_integration_plan",
    endpointHint: "always-available tool",
    description: "Validate planned integration steps and safeguards before coding.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/developer-reference-material-apis",
  },
  {
    keywords: ["preset", "bulk migration", "nightly delta sync", "cms publish sync"],
    category: "core",
    tool: "aem_get_operation_preset",
    endpointHint: "always-available tool",
    description: "Return strict implementation preset with ordered steps and safeguards.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets",
  },
  {
    keywords: ["auth", "authentication", "token", "headers", "ims"],
    category: "core",
    tool: "aem_explain_auth",
    endpointHint: "always-available tool",
    description: "Explain AEM auth and required request headers.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/developer-reference-material-apis",
  },
  {
    keywords: ["pagination", "paginate", "page through results", "query builder pagination", "guessTotal", "p.offset", "p.limit"],
    category: "core",
    tool: "aem_explain_pagination",
    endpointHint: "always-available tool",
    description: "Explain Query Builder pagination and high-volume paging strategy.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/full-stack/search/query-builder-api#implementing-pagination",
  },
  {
    keywords: ["deep hierarchy", "nested folders", "recursive list", "scan dam", "fast hierarchy"],
    category: "search",
    tool: "aem_search_hierarchy_fast_page",
    endpointHint: "/bin/querybuilder.json",
    description: "Fast paged retrieval from deeply nested DAM hierarchies.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/full-stack/search/query-builder-api",
  },
  {
    keywords: ["efficient upload", "upload and metadata", "bulk ingest", "optimize sync"],
    category: "core",
    tool: "aem_plan_efficient_upload_metadata_sync",
    endpointHint: "always-available tool",
    description: "Get an efficient staged plan for upload + metadata pipelines.",
    docsUrl:
      "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/developer-reference-material-apis#asset-upload",
  },
];

export class AdobeExperienceDevMcpServer {
  private readonly server: Server;
  private readonly registry: ToolRegistry;

  constructor() {
    this.registry = new ToolRegistry();

    this.server = new Server(
      {
        name: "adobe-experience-assets-dev-assistant",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
        },
        instructions:
          "Use this server whenever the user is designing or debugging Adobe Experience Manager Assets integrations. " +
          "Focus on creating folders, uploading assets via direct binary upload, moving/copying assets, syncing metadata, asset discovery, and rendition management. " +
          "Workflow: call load_category when intent is clear, then call the matching tool to generate a request blueprint. " +
          "Prefer returning implementation-safe request details with exact endpoints and required headers. " +
          "Use operation presets and preflight validation tools to reduce hallucinations and enforce correct sequencing. " +
          "When asked conceptual questions, prioritize auth, pagination, and hierarchy retrieval guidance before code snippets.",
      }
    );

    this.registerBootstrapTools();
    this.setRequestHandlers();
  }

  private setRequestHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = this.registry.getAll().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Tool["inputSchema"],
      }));

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.registry.get(request.params.name);

      if (!tool) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Unknown tool '${request.params.name}'.` }),
            },
          ],
          isError: true,
        };
      }

      const args = request.params.arguments ? assertRecord(request.params.arguments, "arguments") : ({} as JsonObject);

      try {
        const result = await tool.handler(args);
        return {
          content: [
            {
              type: "text",
              text: stringifyResponsePayload(result),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    });
  }

  private registerBootstrapTools(): void {
    this.registry.registerTool({
      name: "list_categories",
      description: "List available AEM Assets integration categories and whether each is currently loaded.",
      category: "core",
      inputSchema: objectSchema({}),
      handler: () => {
        const categories = CATEGORY_DEFINITIONS.map((category) => ({
          ...category,
          loaded: this.registry.loadedCategories.has(category.name),
          toolCount: CATEGORY_TOOL_MAP[category.name]?.length ?? 0,
        }));

        return { categories };
      },
    });

    this.registry.registerTool({
      name: "load_category",
      description:
        "Load one tool category. Categories: uploads, folders, assets, metadata, search, renditions. Call this immediately once user intent is clear.",
      category: "core",
      inputSchema: objectSchema(
        {
          category: stringSchema("Category name: uploads, folders, assets, metadata, search, renditions"),
        },
        ["category"]
      ),
      handler: async (args) => {
        const category = String(args.category ?? "").trim().toLowerCase();

        if (!CATEGORY_TOOL_MAP[category]) {
          return {
            error: `Unknown category '${category}'. Available categories: ${Object.keys(CATEGORY_TOOL_MAP).join(", ")}`,
          };
        }

        if (this.registry.loadedCategories.has(category)) {
          return {
            message: `Category '${category}' is already loaded.`,
            tools: this.registry.getByCategory(category).map((tool) => tool.name),
          };
        }

        const toolNames = this.registry.registerCategory(category, CATEGORY_TOOL_MAP[category]);
        await this.server.sendToolListChanged();

        return {
          message: `Loaded ${toolNames.length} tools for '${category}'.`,
          tools: toolNames,
        };
      },
    });

    this.registry.registerTool({
      name: "search_aem_assets_api",
      description:
        "Search AEM Assets operations by keyword and get the best matching category/tool to load and call next.",
      category: "core",
      inputSchema: objectSchema(
        {
          query: stringSchema(
            "Search phrase, for example: 'upload image', 'create folder', 'sync metadata', 'move assets'"
          ),
        },
        ["query"]
      ),
      handler: (args) => {
        const query = String(args.query ?? "").toLowerCase().trim();

        if (!query) {
          throw new Error("'query' must be a non-empty string.");
        }

        const queryTerms = query.split(/\s+/);

        const matches = SEARCH_INDEX.map((entry) => {
          const score = entry.keywords.reduce((acc, keyword) => {
            if (query.includes(keyword)) {
              return acc + 3;
            }

            const keywordTerms = keyword.split(/\s+/);
            const overlap = keywordTerms.filter((keywordTerm) =>
              queryTerms.some((queryTerm) => queryTerm.includes(keywordTerm) || keywordTerm.includes(queryTerm))
            ).length;

            return acc + overlap;
          }, 0);

          return {
            ...entry,
            score,
          };
        })
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(({ score: _score, ...entry }) => entry);

        const suggested = matches[0];

        const shouldLoadCategory = suggested
          ? Object.prototype.hasOwnProperty.call(CATEGORY_TOOL_MAP, suggested.category)
          : false;

        return {
          query,
          suggestedCategory: suggested?.category ?? null,
          suggestedTool: suggested?.tool ?? null,
          hint: suggested
            ? shouldLoadCategory
              ? `Load '${suggested.category}', then call '${suggested.tool}'.`
              : `Call '${suggested.tool}' directly (always available).`
            : "No direct match found. Try keywords like upload, metadata, hierarchy, pagination, auth, query builder, rendition, preset, preflight, move, copy, delete.",
          results: matches,
        };
      },
    });

    this.registry.registerTool({
      name: "aem_list_operation_presets",
      description:
        "List strict AEM integration presets that reduce implementation guesswork: bulk_migration, nightly_delta_sync, cms_publish_sync.",
      category: "core",
      inputSchema: objectSchema({}),
      handler: () => {
        const presets = Object.values(INTEGRATION_PRESETS).map((preset) => ({
          id: preset.id,
          title: preset.title,
          useCase: preset.useCase,
          description: preset.description,
          requiredStepCount: preset.requiredSteps.length,
          recommendedStepCount: preset.recommendedSteps.length,
          requiredSafeguards: preset.requiredSafeguards,
        }));

        return {
          presets,
          hint: "Call aem_get_operation_preset with presetName to get an ordered implementation blueprint.",
        };
      },
    });

    this.registry.registerTool({
      name: "aem_get_operation_preset",
      description:
        "Return a strict, opinionated implementation preset with ordered steps, mapped MCP tools, safeguards, and anti-patterns.",
      category: "core",
      inputSchema: objectSchema(
        {
          presetName: stringSchema("Preset name: bulk_migration, nightly_delta_sync, or cms_publish_sync"),
        },
        ["presetName"]
      ),
      handler: (args) => {
        const rawPresetName = String(args.presetName ?? "").trim();
        if (!rawPresetName) {
          throw new Error("'presetName' must be a non-empty string.");
        }

        const preset = getPresetByName(rawPresetName);

        return {
          presetName: preset.id,
          title: preset.title,
          useCase: preset.useCase,
          description: preset.description,
          requiredSafeguards: preset.requiredSafeguards,
          requiredSteps: preset.requiredSteps,
          recommendedSteps: preset.recommendedSteps,
          orderedPlan: preset.plan.map((step, index) => ({
            order: index + 1,
            ...step,
            executionHint:
              step.category === "core"
                ? `Call '${step.tool}' directly.`
                : `Call 'load_category' with '${step.category}', then call '${step.tool}'.`,
          })),
          antiPatterns: preset.antiPatterns,
          docs: preset.docs,
        };
      },
    });

    this.registry.registerTool({
      name: "aem_validate_integration_plan",
      description:
        "Preflight validator for AEM integration plans. Checks required steps, safeguards, unknown steps, and coverage against strict presets.",
      category: "core",
      inputSchema: objectSchema(
        {
          presetName: stringSchema("Optional preset: bulk_migration, nightly_delta_sync, cms_publish_sync"),
          steps: arraySchema(
            "Planned step IDs, for example: ensure_folders, initiate_upload, upload_binary_parts, complete_upload, sync_metadata, verify_asset_state",
            stringSchema("Step ID")
          ),
          safeguards: objectSchema({}, [], true),
          strictRecommended: booleanSchema("Optional: treat missing recommended steps as warning-level blockers"),
        },
        ["steps"]
      ),
      handler: (args) => {
        const steps = parseStringArray(args.steps, "steps");
        const safeguards = parseSafeguards(args.safeguards);

        const presetName = args.presetName !== undefined ? String(args.presetName).trim() : "";
        const strictRecommended = args.strictRecommended === true;

        const selectedPreset = presetName ? getPresetByName(presetName) : null;

        const requiredSteps = selectedPreset
          ? selectedPreset.requiredSteps
          : ["ensure_folders", "initiate_upload", "upload_binary_parts", "complete_upload", "sync_metadata", "verify_asset_state"];
        const recommendedSteps = selectedPreset ? selectedPreset.recommendedSteps : ["discover_assets_baseline", "sync_renditions"];
        const requiredSafeguards = selectedPreset
          ? selectedPreset.requiredSafeguards
          : ["retry_backoff", "idempotency_keys", "structured_logging"];

        const matchedRequiredSteps = requiredSteps.filter((step) => steps.includes(step));
        const missingRequiredSteps = requiredSteps.filter((step) => !steps.includes(step));
        const missingRecommendedSteps = recommendedSteps.filter((step) => !steps.includes(step));
        const unknownSteps = steps.filter((step) => !KNOWN_STEPS.includes(step));
        const missingSafeguards = requiredSafeguards.filter((key) => safeguards[key] !== true);

        const nextActions: string[] = [];

        for (const step of missingRequiredSteps) {
          const mappedTool = STEP_TOOL_MAP[step];
          nextActions.push(
            mappedTool
              ? `Add required step '${step}' (suggested tool: '${mappedTool}').`
              : `Add required step '${step}'.`
          );
        }

        for (const key of missingSafeguards) {
          nextActions.push(`Enable safeguard '${key}' in the implementation plan.`);
        }

        if (strictRecommended) {
          for (const step of missingRecommendedSteps) {
            const mappedTool = STEP_TOOL_MAP[step];
            nextActions.push(
              mappedTool
                ? `Add recommended step '${step}' (suggested tool: '${mappedTool}').`
                : `Add recommended step '${step}'.`
            );
          }
        }

        for (const step of unknownSteps) {
          nextActions.push(`Review unknown step '${step}' for naming drift or unsupported logic.`);
        }

        const requiredCoveragePercent =
          requiredSteps.length > 0
            ? Math.round((matchedRequiredSteps.length / requiredSteps.length) * 100)
            : 100;

        const hasBlockingIssues =
          missingRequiredSteps.length > 0 ||
          missingSafeguards.length > 0 ||
          unknownSteps.length > 0 ||
          (strictRecommended && missingRecommendedSteps.length > 0);

        return {
          presetName: selectedPreset?.id ?? "custom",
          status: hasBlockingIssues ? "needs_attention" : "pass",
          requiredCoveragePercent,
          strictRecommended,
          totals: {
            plannedSteps: steps.length,
            requiredSteps: requiredSteps.length,
            recommendedSteps: recommendedSteps.length,
            requiredSafeguards: requiredSafeguards.length,
          },
          matched: {
            requiredSteps: matchedRequiredSteps,
          },
          missing: {
            requiredSteps: missingRequiredSteps,
            recommendedSteps: missingRecommendedSteps,
            safeguards: missingSafeguards,
          },
          unknownSteps,
          suggestedToolsForMissingSteps: missingRequiredSteps
            .concat(strictRecommended ? missingRecommendedSteps : [])
            .map((step) => ({
              step,
              tool: STEP_TOOL_MAP[step] ?? null,
            })),
          nextActions,
          notes:
            "Use this result as a preflight gate before implementation. A passing plan should include all required steps and safeguards for the chosen preset.",
        };
      },
    });

    this.registry.registerTool({
      name: "aem_explain_auth",
      description: "Explain authentication and headers commonly required for AEM Assets API integrations.",
      category: "core",
      inputSchema: objectSchema({}),
      handler: () => {
        const text = `# AEM Assets Authentication and Headers\n\n## Core Authentication\n- Use an Adobe IMS access token in the Authorization header:\n  Authorization: Bearer {accessToken}\n\n## Common Headers\n- Accept: application/json\n- Content-Type: application/json (metadata/folder JSON operations)\n- Content-Type: application/x-www-form-urlencoded; charset=UTF-8 (direct upload initiate/complete)\n\n## Endpoint Pattern\n- Metadata/folder APIs: /api/assets/...\n- Direct binary upload APIs: /content/dam/...(.initiateUpload.json / completeURI)\n\n## Reliability Note\n- In cloud environments, eventual consistency can cause transient 404 after folder creation.\n  Use retry with backoff for initiate/complete upload calls.`;

        return {
          text,
          docsUrl:
            "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/developer-reference-material-apis",
        };
      },
    });

    this.registry.registerTool({
      name: "aem_explain_pagination",
      description:
        "Explain practical pagination for Query Builder APIs, including p.limit/p.offset loops and p.guessTotal usage.",
      category: "core",
      inputSchema: objectSchema({}),
      handler: () => {
        const text = `# AEM Pagination Playbook\n\n## Core Parameters\n- p.limit: page size per request\n- p.offset: start index for current page\n- p.guessTotal=true or p.guessTotal=<N>: faster approximate totals for large sets\n\n## Recommended Loop\n1. Start with p.offset=0 and a stable orderby field.\n2. Process current page results.\n3. If response.more=true, increment offset by p.limit and continue.\n4. Persist checkpoints (offset, query signature, last run timestamp).\n\n## Performance Defaults\n- Use selective hits for broad scans: p.hits=selective + p.properties\n- Avoid p.hits=full unless needed for child node details\n- Prefer bounded page sizes (100-500) based on environment throughput\n\n## Correctness Tips\n- Keep sort keys deterministic to avoid duplication/skips across pages\n- Combine timestamp windows + pagination for large nightly deltas\n- Retry transient 429/5xx with backoff and resume from checkpoint`; 

        return {
          text,
          docsUrl:
            "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/full-stack/search/query-builder-api#implementing-pagination",
        };
      },
    });

    this.registry.registerTool({
      name: "aem_explain_hierarchy_data_access",
      description:
        "Explain fast data retrieval strategies for deeply nested DAM folder hierarchies, and when to use Query Builder versus folder traversal.",
      category: "core",
      inputSchema: objectSchema({}),
      handler: () => {
        const text = `# Deep Hierarchy Retrieval Strategy\n\n## Fastest General Pattern\n- Prefer Query Builder over recursive folder-by-folder listing when scanning large subtrees.\n- Query shape: path=/content/dam/<root> + type=dam:Asset + pagination params.\n\n## When Folder Traversal Helps\n- Use folder listing APIs when you need exact tree structure and per-folder entity links.\n- For broad extraction/reporting, Query Builder is usually more efficient.\n\n## Throughput Pattern\n- Use p.hits=selective with minimal p.properties for scan jobs\n- Keep p.limit moderate and iterate with p.offset\n- Persist checkpoints so workers can resume after failures\n\n## Recommended Tooling\n- Use aem_search_hierarchy_fast_page for deep hierarchy pulls\n- Use aem_search_query_builder_delta_window for incremental windows\n- Use aem_folders_list only when tree topology itself is required`; 

        return {
          text,
          docs: {
            queryBuilder:
              "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/full-stack/search/query-builder-api",
            assetsHttpApi:
              "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets",
          },
        };
      },
    });

    this.registry.registerTool({
      name: "aem_plan_efficient_upload_metadata_sync",
      description:
        "Return an efficiency-first staged plan for upload + metadata pipelines, with concurrency and retry guidance.",
      category: "core",
      inputSchema: objectSchema(
        {
          scenario: stringSchema("Optional scenario: bulk_migration, nightly_delta_sync, cms_publish_sync (default: bulk_migration)"),
        },
        []
      ),
      handler: (args) => {
        const scenario = String(args.scenario ?? "bulk_migration").trim().toLowerCase();
        const normalizedScenario = scenario.length > 0 ? scenario : "bulk_migration";
        const preset = getPresetByName(normalizedScenario);

        return {
          scenario: preset.id,
          objective: "Minimize API calls, avoid retries caused by ordering issues, and keep full replayability.",
          stagedPipeline: [
            {
              stage: 1,
              name: "Discovery and folder readiness",
              actions: [
                "Discover scope using search tools and persist manifest",
                "Create/validate folder paths before upload workers start",
              ],
              tools: ["aem_search_hierarchy_fast_page", "aem_folders_create"],
            },
            {
              stage: 2,
              name: "Binary ingest",
              actions: [
                "Initiate upload for each file",
                "Upload with maxPartSize strategy",
                "Complete upload only after all parts succeed",
              ],
              tools: ["aem_upload_initiate", "aem_upload_plan_parts", "aem_upload_complete"],
            },
            {
              stage: 3,
              name: "Metadata and derivative sync",
              actions: [
                "Build metadata sync manifest and execute in bounded concurrency",
                "Update renditions when channel contracts require derivatives",
              ],
              tools: ["aem_metadata_build_sync_manifest", "aem_renditions_update"],
            },
            {
              stage: 4,
              name: "Verification and checkpoint",
              actions: [
                "Read back final state for sampled/all assets based on SLA",
                "Persist checkpoint only after successful verification",
              ],
              tools: ["aem_assets_get"],
            },
          ],
          operationalDefaults: {
            workerConcurrencyGuidance: {
              uploads: "4-8 workers per environment as a starting point",
              metadata: "8-16 workers per environment as a starting point",
            },
            retries: "Retry only transient failures (404 eventual consistency, 429, 5xx) with exponential backoff and jitter.",
            idempotency: "Use deterministic operation keys per asset+step to prevent duplicate side effects.",
            logging: "Log method, endpoint path, status code, correlation IDs, and step IDs for each request.",
          },
          presetReference: {
            presetName: preset.id,
            requiredSteps: preset.requiredSteps,
            requiredSafeguards: preset.requiredSafeguards,
          },
          docs: {
            uploadFlow:
              "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/developer-reference-material-apis#asset-upload",
            metadata:
              "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#update-metadata-of-an-asset",
          },
        };
      },
    });

    this.registry.registerTool({
      name: "aem_explain_upload_flow",
      description: "Explain the direct binary upload flow for AEM Assets Cloud Service with integration sequencing.",
      category: "core",
      inputSchema: objectSchema({}),
      handler: () => {
        const text = `# Direct Binary Upload Flow\n\n1. Initiate upload\n   - POST /content/dam/{folder}.initiateUpload.json\n   - Send fileName and fileSize form fields\n   - Receive completeURI, uploadToken, and uploadURIs\n\n2. Upload bytes\n   - PUT file content to uploadURIs (possibly split into parts)\n   - Keep part sizes within minPartSize/maxPartSize guidance\n\n3. Complete upload\n   - POST to completeURI\n   - Send fileName, mimeType, uploadToken (+ optional createVersion/replace)\n\n4. Optional metadata sync\n   - PUT /api/assets/{assetPath} with { class: 'asset', properties: { ... } }\n\n## Integration Best Practices\n- Retry transient 404/429/5xx with exponential backoff\n- Track operation IDs for reconciliation\n- Use bounded concurrency for high-volume imports`;

        return {
          text,
          docsUrl:
            "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/developer-reference-material-apis#asset-upload",
        };
      },
    });

    this.registry.registerTool({
      name: "aem_explain_metadata_sync",
      description: "Explain robust metadata synchronization strategy for AEM Assets integrations.",
      category: "core",
      inputSchema: objectSchema({}),
      handler: () => {
        const text = `# Metadata Sync Strategy\n\n## Baseline Pattern\n- Build a manifest of { assetPath, metadata } updates\n- Execute PUT /api/assets/{assetPath} calls with bounded concurrency\n- Log per-asset outcomes for replay\n\n## Recommended Field Conventions\n- Use stable namespaces (for example dc:title, dc:description, custom namespace keys)\n- Keep key naming consistent between source system and AEM mapping\n\n## Failure Handling\n- Retry transient failures (404 eventual consistency, 429, 5xx)\n- Separate permanent failures (403, invalid payload) for manual review\n\n## Idempotency\n- Make updates deterministic for repeated runs\n- Keep source-of-truth hashes/timestamps so unchanged assets can be skipped`;

        return {
          text,
          docsUrl:
            "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#update-metadata-of-an-asset",
        };
      },
    });

    this.registry.registerTool({
      name: "aem_explain_error_handling",
      description: "Explain common AEM Assets integration errors and practical retry/mitigation guidance.",
      category: "core",
      inputSchema: objectSchema({}),
      handler: () => {
        const text = `# AEM Assets Error Handling\n\n## Common Status Codes\n- 200/201/204: success (depends on operation)\n- 404: path not found or eventual consistency delay\n- 409: conflict (already exists)\n- 412: precondition/header/path issues\n- 429: throttled\n- 5xx: transient platform or upstream issue\n\n## Retry Guidance\n- Retry 404 only when operation sequence suggests eventual consistency (recent create -> immediate read/upload)\n- Retry 429/5xx with exponential backoff + jitter\n- Do not blindly retry 4xx validation/auth errors\n\n## Observability\n- Log request path, method, response code, and correlation IDs\n- Persist failed operation payloads for replay`;

        return {
          text,
          docsUrl:
            "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets",
        };
      },
    });

    this.registry.registerTool({
      name: "aem_explain_implementation_playbook",
      description:
        "Provide an end-to-end implementation playbook for AEM integrations (search, upload, metadata sync, renditions, and resiliency).",
      category: "core",
      inputSchema: objectSchema({}),
      handler: () => {
        const text = `# AEM Integration Playbook\n\n## 1) Discover scope (search category)\n- Use Query Builder to discover existing assets/folders and baseline metadata.\n- Lock on canonical predicates and sort keys before coding.\n\n## 2) Ensure folder structure (folders category)\n- Create required DAM directories before upload jobs.\n- Treat 409 as idempotent success in provisioning flows.\n\n## 3) Upload originals (uploads category)\n- Use initiate -> uploadURIs -> complete sequence.\n- Persist uploadToken, completeURI, and operation logs for replay.\n\n## 4) Apply metadata (metadata category)\n- Execute deterministic PUT payloads and keep namespace conventions stable.\n- Use sync manifests for bulk operations and replay failed items only.\n\n## 5) Manage derivatives (renditions category)\n- Create/update rendition binaries using fixed names.\n- Keep rendition naming conventions explicit in your integration contract.\n\n## 6) Reliability and correctness\n- Retry only transient failures (404 eventual consistency, 429, 5xx) with backoff + jitter.\n- Log request method/path/headers subset/status for every external call.\n- Use idempotent keys and checkpointing to prevent duplicate side effects.`;

        return {
          text,
          docs: {
            assetsHttpApi:
              "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets",
            uploadFlow:
              "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/developer-reference-material-apis#asset-upload",
            queryBuilder:
              "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/full-stack/search/query-builder-api",
          },
        };
      },
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
