import type { JsonObject } from "../types.js";

export const categoryNames = ["uploads", "folders", "assets", "metadata", "search", "renditions"];

export const toolFixtures: Record<string, JsonObject> = {
  list_categories: {},
  aem_set_context: {
    baseUrl: "https://author.example.adobeaemcloud.com",
    cloudFlavor: "cloud_service",
    authMode: "ims_bearer_token",
    defaultDamRoot: "integration-tests",
    retryPolicy: {
      maxAttempts: 4,
      baseDelayMs: 200,
      maxDelayMs: 2500,
      jitter: true,
    },
  },
  aem_get_context: {},
  aem_reset_context: {},
  load_category: { category: "uploads" },
  search_aem_assets_api: { query: "upload image and sync metadata", maxResults: 5, semanticRerank: true },
  aem_list_operation_presets: {},
  aem_get_operation_preset: { presetName: "bulk_migration" },
  aem_validate_integration_plan: {
    presetName: "bulk_migration",
    steps: [
      "discover_assets_baseline",
      "ensure_folders",
      "initiate_upload",
      "upload_binary_parts",
      "complete_upload",
      "sync_metadata",
      "verify_asset_state",
    ],
    safeguards: {
      retry_backoff: true,
      idempotency_keys: true,
      checkpoints: true,
      bounded_concurrency: true,
      structured_logging: true,
    },
    executionPolicy: {
      idempotencyKeyStrategy: "{assetPath}:{step}:{checksum}",
      concurrencyLimit: 8,
      checkpointStore: "postgres://integration-store/checkpoints",
      checkpointCommitCondition: "commit only after verify_asset_state success",
    },
  },
  aem_explain_auth: {},
  aem_explain_pagination: {},
  aem_explain_hierarchy_data_access: {},
  aem_plan_efficient_upload_metadata_sync: { scenario: "bulk_migration" },
  aem_explain_upload_flow: {},
  aem_explain_metadata_sync: {},
  aem_explain_error_handling: {},
  aem_explain_implementation_playbook: {},
  aem_upload_initiate: {
    folderPath: "marketing/campaigns/2026",
    fileName: "hero-banner.jpg",
    fileSize: 4194304,
  },
  aem_upload_complete: {
    completeUri: "/content/dam/marketing/campaigns/2026.completeUpload.json",
    fileName: "hero-banner.jpg",
    mimeType: "image/jpeg",
    uploadToken: "token-123",
    initiateContract: {
      completeUri: "/content/dam/marketing/campaigns/2026.completeUpload.json",
      fileName: "hero-banner.jpg",
      uploadToken: "token-123",
    },
  },
  aem_upload_plan_parts: {
    fileSize: 7340032,
    maxPartSize: 5242880,
    minPartSize: 1048576,
    uploadUris: ["https://upload.example/part-1", "https://upload.example/part-2"],
  },
  aem_folders_list: { folderPath: "marketing/campaigns" },
  aem_folders_create: { parentPath: "marketing", folderName: "campaigns", title: "Campaigns" },
  aem_folders_copy: { sourcePath: "marketing/source", destinationPath: "marketing/destination", overwrite: false },
  aem_folders_move: { sourcePath: "marketing/source", destinationPath: "marketing/archive", overwrite: false },
  aem_folders_delete: { folderPath: "marketing/archive/old-campaign" },
  aem_assets_get: { assetPath: "marketing/campaigns/hero.jpg" },
  aem_assets_copy: {
    sourcePath: "marketing/campaigns/hero.jpg",
    destinationPath: "marketing/campaigns/hero-copy.jpg",
    overwrite: false,
  },
  aem_assets_move: {
    sourcePath: "marketing/campaigns/hero-old.jpg",
    destinationPath: "marketing/archive/hero-old.jpg",
    overwrite: false,
  },
  aem_assets_delete: { assetPath: "marketing/archive/hero-old.jpg" },
  aem_metadata_get: { assetPath: "marketing/campaigns/hero.jpg" },
  aem_metadata_update: {
    assetPath: "marketing/campaigns/hero.jpg",
    metadata: {
      "dc:title": "Hero Banner",
      "dc:description": "Homepage spring campaign hero",
    },
  },
  aem_metadata_build_sync_manifest: {
    updates: [
      {
        assetPath: "marketing/campaigns/hero.jpg",
        metadata: {
          "dc:title": "Hero Banner",
        },
      },
      {
        assetPath: "marketing/campaigns/card.jpg",
        metadata: {
          "dc:title": "Card Banner",
        },
      },
    ],
  },
  aem_search_query_builder_assets: {
    path: "marketing/campaigns",
    limit: 50,
    offset: 0,
    includeTotal: true,
  },
  aem_search_hierarchy_fast_page: {
    path: "marketing",
    pageSize: 200,
    offset: 0,
    guessTotal: true,
  },
  aem_search_query_builder_delta_window: {
    path: "marketing",
    modifiedFrom: "2026-04-01T00:00:00.000Z",
    modifiedTo: "2026-04-20T00:00:00.000Z",
    limit: 200,
    offset: 0,
  },
  aem_renditions_create: {
    assetPath: "marketing/campaigns/hero.jpg",
    renditionName: "web-optimized.jpg",
    contentType: "image/jpeg",
  },
  aem_renditions_update: {
    assetPath: "marketing/campaigns/hero.jpg",
    renditionName: "web-optimized.jpg",
    contentType: "image/jpeg",
  },
  aem_renditions_delete: {
    assetPath: "marketing/campaigns/hero.jpg",
    renditionName: "web-optimized.jpg",
  },
};

export const routingEvalPrompts: Array<{ query: string; expectedTool: string }> = [
  { query: "how do I initiate direct binary upload", expectedTool: "aem_upload_initiate" },
  { query: "find assets modified since yesterday", expectedTool: "aem_search_query_builder_delta_window" },
  { query: "create a folder in dam", expectedTool: "aem_folders_create" },
  { query: "update dc:title metadata for an asset", expectedTool: "aem_metadata_update" },
  { query: "how should I paginate query builder results", expectedTool: "aem_explain_pagination" },
  { query: "what auth headers are required", expectedTool: "aem_explain_auth" },
  { query: "replace an existing rendition binary", expectedTool: "aem_renditions_update" },
  { query: "run preflight validation on my integration plan", expectedTool: "aem_validate_integration_plan" },
  { query: "efficient upload and metadata sync strategy", expectedTool: "aem_plan_efficient_upload_metadata_sync" },
  { query: "move asset to archive folder", expectedTool: "aem_assets_move" },
  { query: "scan deep nested hierarchy quickly", expectedTool: "aem_search_hierarchy_fast_page" },
  { query: "complete upload after sending parts", expectedTool: "aem_upload_complete" },
];

export const endpointEvalCases: Array<{ toolName: string; expectedContains: string }> = [
  { toolName: "aem_upload_initiate", expectedContains: "/content/dam/" },
  { toolName: "aem_upload_complete", expectedContains: "/content/dam/" },
  { toolName: "aem_folders_create", expectedContains: "/api/assets/" },
  { toolName: "aem_assets_get", expectedContains: "/api/assets/" },
  { toolName: "aem_metadata_update", expectedContains: "/api/assets/" },
  { toolName: "aem_search_query_builder_assets", expectedContains: "/bin/querybuilder.json" },
  { toolName: "aem_search_query_builder_delta_window", expectedContains: "/bin/querybuilder.json" },
  { toolName: "aem_renditions_update", expectedContains: "/renditions/" },
];
