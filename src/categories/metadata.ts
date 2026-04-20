import type { ToolDefinition } from "../types.js";
import { arraySchema, objectSchema, stringSchema } from "../schemas.js";
import {
  assertRecord,
  buildJsonHeaders,
  getArray,
  getBaseUrl,
  getRepositoryPath,
  getString,
  requiredAccess,
  toApiAssetsEndpoint,
} from "../utils.js";

function normalizeMetadataProperties(input: unknown): Record<string, string | number | boolean | null> {
  const record = assertRecord(input, "metadata");

  const normalized: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(record)) {
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new Error("Metadata keys must be non-empty strings.");
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      normalized[key] = value;
      continue;
    }

    throw new Error(
      `Metadata value for '${key}' must be a string, number, boolean, or null. Nested objects/arrays are not supported by this helper.`
    );
  }

  if (Object.keys(normalized).length === 0) {
    throw new Error("'metadata' must include at least one property.");
  }

  return normalized;
}

export const metadataTools: ToolDefinition[] = [
  {
    name: "aem_metadata_get",
    description: "Build a request to retrieve asset metadata from AEM Assets HTTP API.",
    category: "metadata",
    inputSchema: objectSchema(
      {
        assetPath: stringSchema("Asset path relative to /content/dam", { minLength: 1 }),
        baseUrl: stringSchema("Optional AEM author base URL", { pattern: "^https?://" }),
      },
      ["assetPath"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const assetPath = getRepositoryPath(args, "assetPath");
      const endpoint = toApiAssetsEndpoint(baseUrl, assetPath, true);

      return {
        endpoint,
        method: "GET",
        headers: {
          Authorization: "Bearer {accessToken}",
          Accept: "application/json",
        },
        pathParams: { assetPath },
        queryParams: {},
        body: null,
        description: `Get metadata for '/content/dam/${assetPath}'.`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#update-metadata-of-an-asset",
        codeExample: `const response = await fetch('${endpoint}', {\n  method: 'GET',\n  headers: { Authorization: 'Bearer {accessToken}', Accept: 'application/json' }\n});\nconst asset = await response.json();\nconst metadata = asset.properties;`,
        requiredAccess: requiredAccess("Read metadata on the target asset under /content/dam"),
        notes:
          "Assets HTTP API returns a metadata subset. For full repository metadata, teams often inspect /jcr_content/metadata.json separately.",
      };
    },
  },
  {
    name: "aem_metadata_update",
    description: "Build a request to update asset metadata in AEM Assets HTTP API.",
    category: "metadata",
    inputSchema: objectSchema(
      {
        assetPath: stringSchema("Asset path relative to /content/dam", { minLength: 1 }),
        metadata: objectSchema(
          {
            "dc:title": stringSchema("Example metadata field"),
          },
          [],
          true,
          { minProperties: 1 }
        ),
        baseUrl: stringSchema("Optional AEM author base URL", { pattern: "^https?://" }),
      },
      ["assetPath", "metadata"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const assetPath = getRepositoryPath(args, "assetPath");
      const metadata = normalizeMetadataProperties(args.metadata);

      const endpoint = toApiAssetsEndpoint(baseUrl, assetPath, false);
      const body = {
        class: "asset",
        properties: metadata,
      };

      return {
        endpoint,
        method: "PUT",
        headers: buildJsonHeaders(),
        pathParams: { assetPath },
        queryParams: {},
        body,
        description: `Update metadata for '/content/dam/${assetPath}'.`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#update-metadata-of-an-asset",
        codeExample: `const response = await fetch('${endpoint}', {\n  method: 'PUT',\n  headers: {\n    Authorization: 'Bearer {accessToken}',\n    Accept: 'application/json',\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify(${JSON.stringify(body, null, 2)})\n});`,
        requiredAccess: requiredAccess("Write metadata permission on the target asset under /content/dam"),
        notes:
          "When updating dc:* properties, AEM may map corresponding jcr:* values. Keep namespace choices consistent across your integration.",
      };
    },
  },
  {
    name: "aem_metadata_build_sync_manifest",
    description:
      "Build a metadata sync manifest for many assets. Returns ready-to-execute per-asset PUT requests.",
    category: "metadata",
    inputSchema: objectSchema(
      {
        baseUrl: stringSchema("Optional AEM author base URL", { pattern: "^https?://" }),
        updates: arraySchema(
          "List of metadata updates",
          objectSchema(
            {
              assetPath: stringSchema("Asset path relative to /content/dam", { minLength: 1 }),
              metadata: objectSchema({}, [], true, { minProperties: 1 }),
            },
            ["assetPath", "metadata"],
            false
          ),
          { minItems: 1 }
        ),
      },
      ["updates"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const updates = getArray(args, "updates");

      if (updates.length === 0) {
        throw new Error("'updates' must include at least one update item.");
      }

      const operations = updates.map((item, index) => {
        const entry = assertRecord(item, `updates[${index}]`);
        const assetPath = getRepositoryPath(entry, "assetPath");
        const metadata = normalizeMetadataProperties(entry.metadata);
        const endpoint = toApiAssetsEndpoint(baseUrl, assetPath, false);

        return {
          operationId: `${index + 1}`,
          endpoint,
          method: "PUT",
          headers: buildJsonHeaders(),
          body: {
            class: "asset",
            properties: metadata,
          },
        };
      });

      return {
        totalOperations: operations.length,
        strategy:
          "Execute these operations with bounded concurrency and retry transient failures (404 eventual consistency, 429, 5xx).",
        operations,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#update-metadata-of-an-asset",
        notes:
          "For large syncs, record request IDs and asset paths per attempt. This makes reconciliation and replay easier.",
      };
    },
  },
];
