import type { ToolDefinition } from "../types.js";
import { arraySchema, booleanSchema, numberSchema, objectSchema, stringSchema } from "../schemas.js";
import {
  assertRecord,
  getArray,
  getBaseUrl,
  getIsoTimestamp,
  getNonNegativeInteger,
  getOptionalBoolean,
  getOptionalNumber,
  getOptionalString,
  getRepositoryPath,
  getString,
  normalizeRepositoryPath,
  requiredAccess,
  toApiAssetsEndpoint,
  toApiAssetsRelativePath,
} from "../utils.js";

function getDepth(args: Record<string, unknown>): string {
  const value = getOptionalString(args, "depth") ?? "0";
  if (value !== "0" && value !== "infinity") {
    throw new Error("'depth' must be either '0' or 'infinity'.");
  }
  return value;
}

function ensureNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`'${fieldName}' must be a non-negative integer.`);
  }
}

function parseOptionalStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  const array = getArray(args, key);
  if (array.length === 0) {
    throw new Error(`'${key}' must contain at least one item when provided.`);
  }

  return array.map((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`'${key}[${index}]' must be a non-empty string.`);
    }
    return item.trim();
  });
}

export const assetsTools: ToolDefinition[] = [
  {
    name: "aem_assets_get",
    description: "Build a request to retrieve a single asset representation from AEM Assets HTTP API.",
    category: "assets",
    inputSchema: objectSchema(
      {
        assetPath: stringSchema("Asset path relative to /content/dam (example: marketing/campaigns/hero.jpg)", {
          minLength: 1,
        }),
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
        description: `Get asset metadata and links for '/content/dam/${assetPath}'.`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#manage-assets",
        codeExample: `const response = await fetch('${endpoint}', {\n  method: 'GET',\n  headers: { Authorization: 'Bearer {accessToken}', Accept: 'application/json' }\n});\nconst asset = await response.json();`,
        requiredAccess: requiredAccess("Read permission for the target asset under /content/dam"),
        notes: "This representation includes metadata subset, links, and child entities such as renditions.",
      };
    },
  },
  {
    name: "aem_assets_copy",
    description: "Build a request to copy an asset in AEM Assets HTTP API.",
    category: "assets",
    inputSchema: objectSchema(
      {
        sourcePath: stringSchema("Source asset path relative to /content/dam", { minLength: 1 }),
        destinationPath: stringSchema("Destination asset path relative to /content/dam", { minLength: 1 }),
        overwrite: booleanSchema("Optional: set true to allow overwrite"),
        depth: stringSchema("Optional COPY depth, usually '0' for single assets", { enum: ["0", "infinity"] }),
        baseUrl: stringSchema("Optional AEM author base URL", { pattern: "^https?://" }),
      },
      ["sourcePath", "destinationPath"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const sourcePath = getRepositoryPath(args, "sourcePath");
      const destinationPath = getRepositoryPath(args, "destinationPath");
      const overwrite = getOptionalBoolean(args, "overwrite") ?? false;
      const depth = getDepth(args);

      const endpoint = toApiAssetsEndpoint(baseUrl, sourcePath, false);
      const destinationHeader = toApiAssetsRelativePath(destinationPath);

      return {
        endpoint,
        method: "COPY",
        headers: {
          Authorization: "Bearer {accessToken}",
          "X-Destination": destinationHeader,
          "X-Depth": depth,
          "X-Overwrite": overwrite ? "T" : "F",
        },
        pathParams: { sourcePath, destinationPath },
        queryParams: {},
        body: null,
        description: `Copy asset '/content/dam/${sourcePath}' to '/content/dam/${destinationPath}'.`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#copy-a-folder-or-an-asset",
        codeExample: `await fetch('${endpoint}', {\n  method: 'COPY',\n  headers: {\n    Authorization: 'Bearer {accessToken}',\n    'X-Destination': '${destinationHeader}',\n    'X-Depth': '${depth}',\n    'X-Overwrite': '${overwrite ? "T" : "F"}'\n  }\n});`,
        requiredAccess: requiredAccess("Read source asset and create permissions at destination path"),
        notes: "Depth defaults to '0' for single asset operations.",
      };
    },
  },
  {
    name: "aem_assets_move",
    description: "Build a request to move an asset in AEM Assets HTTP API.",
    category: "assets",
    inputSchema: objectSchema(
      {
        sourcePath: stringSchema("Source asset path relative to /content/dam", { minLength: 1 }),
        destinationPath: stringSchema("Destination asset path relative to /content/dam", { minLength: 1 }),
        overwrite: booleanSchema("Optional: set true to force overwrite"),
        depth: stringSchema("Optional MOVE depth, usually '0' for single assets", { enum: ["0", "infinity"] }),
        baseUrl: stringSchema("Optional AEM author base URL", { pattern: "^https?://" }),
      },
      ["sourcePath", "destinationPath"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const sourcePath = getRepositoryPath(args, "sourcePath");
      const destinationPath = getRepositoryPath(args, "destinationPath");
      const overwrite = getOptionalBoolean(args, "overwrite") ?? false;
      const depth = getDepth(args);

      const endpoint = toApiAssetsEndpoint(baseUrl, sourcePath, false);
      const destinationHeader = toApiAssetsRelativePath(destinationPath);

      return {
        endpoint,
        method: "MOVE",
        headers: {
          Authorization: "Bearer {accessToken}",
          "X-Destination": destinationHeader,
          "X-Depth": depth,
          "X-Overwrite": overwrite ? "T" : "F",
        },
        pathParams: { sourcePath, destinationPath },
        queryParams: {},
        body: null,
        description: `Move asset '/content/dam/${sourcePath}' to '/content/dam/${destinationPath}'.`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#move-a-folder-or-an-asset",
        codeExample: `await fetch('${endpoint}', {\n  method: 'MOVE',\n  headers: {\n    Authorization: 'Bearer {accessToken}',\n    'X-Destination': '${destinationHeader}',\n    'X-Depth': '${depth}',\n    'X-Overwrite': '${overwrite ? "T" : "F"}'\n  }\n});`,
        requiredAccess: requiredAccess("Move/delete permission on source and create permission at destination"),
        notes: "MOVE preserves identity history better than delete + reupload in many DAM workflows.",
      };
    },
  },
  {
    name: "aem_assets_delete",
    description: "Build a request to delete an asset in AEM Assets HTTP API.",
    category: "assets",
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
      const endpoint = toApiAssetsEndpoint(baseUrl, assetPath, false);

      return {
        endpoint,
        method: "DELETE",
        headers: {
          Authorization: "Bearer {accessToken}",
        },
        pathParams: { assetPath },
        queryParams: {},
        body: null,
        description: `Delete asset '/content/dam/${assetPath}'.`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#delete-a-folder-asset-or-rendition",
        codeExample: `await fetch('${endpoint}', {\n  method: 'DELETE',\n  headers: { Authorization: 'Bearer {accessToken}' }\n});`,
        requiredAccess: requiredAccess("Delete permission for the target asset under /content/dam"),
        notes: "Use versioning and workflow approvals in production before irreversible deletes.",
      };
    },
  },
];

export const renditionsTools: ToolDefinition[] = [
  {
    name: "aem_renditions_create",
    description: "Build a request to create an asset rendition in AEM Assets HTTP API.",
    category: "renditions",
    inputSchema: objectSchema(
      {
        assetPath: stringSchema("Asset path relative to /content/dam", { minLength: 1 }),
        renditionName: stringSchema("Rendition name (example: web-optimized.jpg or cq5dam.thumbnail.319.319.png)", {
          minLength: 1,
        }),
        contentType: stringSchema("Binary MIME type for rendition upload (default: application/octet-stream)"),
        baseUrl: stringSchema("Optional AEM author base URL", { pattern: "^https?://" }),
      },
      ["assetPath", "renditionName"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const assetPath = getRepositoryPath(args, "assetPath");
      const renditionName = getString(args, "renditionName");
      const contentType = getOptionalString(args, "contentType") ?? "application/octet-stream";
      const endpoint = toApiAssetsEndpoint(baseUrl, `${assetPath}/renditions/${renditionName}`, false);

      return {
        endpoint,
        method: "POST",
        headers: {
          Authorization: "Bearer {accessToken}",
          "Content-Type": contentType,
        },
        pathParams: { assetPath, renditionName },
        queryParams: {},
        body: "<binary-stream>",
        description: `Create rendition '${renditionName}' for '/content/dam/${assetPath}'.`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#create-an-asset-rendition",
        codeExample: `import { createReadStream } from 'node:fs';\n\nconst response = await fetch('${endpoint}', {\n  method: 'POST',\n  headers: {\n    Authorization: 'Bearer {accessToken}',\n    'Content-Type': '${contentType}'\n  },\n  body: createReadStream('/path/to/rendition-binary')\n});`,
        requiredAccess: requiredAccess("Write permissions for renditions on the target asset under /content/dam"),
        notes:
          "For AEM as a Cloud Service, this rendition API remains useful for non-original binaries, while original asset binary ingest should use direct binary upload flow.",
      };
    },
  },
  {
    name: "aem_renditions_update",
    description: "Build a request to update/replace an existing rendition in AEM Assets HTTP API.",
    category: "renditions",
    inputSchema: objectSchema(
      {
        assetPath: stringSchema("Asset path relative to /content/dam", { minLength: 1 }),
        renditionName: stringSchema("Existing rendition name to replace", { minLength: 1 }),
        contentType: stringSchema("Binary MIME type for rendition upload (default: application/octet-stream)"),
        baseUrl: stringSchema("Optional AEM author base URL", { pattern: "^https?://" }),
      },
      ["assetPath", "renditionName"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const assetPath = getRepositoryPath(args, "assetPath");
      const renditionName = getString(args, "renditionName");
      const contentType = getOptionalString(args, "contentType") ?? "application/octet-stream";
      const endpoint = toApiAssetsEndpoint(baseUrl, `${assetPath}/renditions/${renditionName}`, false);

      return {
        endpoint,
        method: "PUT",
        headers: {
          Authorization: "Bearer {accessToken}",
          "Content-Type": contentType,
        },
        pathParams: { assetPath, renditionName },
        queryParams: {},
        body: "<binary-stream>",
        description: `Update rendition '${renditionName}' for '/content/dam/${assetPath}'.`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#update-an-asset-rendition",
        codeExample: `import { createReadStream } from 'node:fs';\n\nawait fetch('${endpoint}', {\n  method: 'PUT',\n  headers: {\n    Authorization: 'Bearer {accessToken}',\n    'Content-Type': '${contentType}'\n  },\n  body: createReadStream('/path/to/new-rendition-binary')\n});`,
        requiredAccess: requiredAccess("Write permissions for renditions on the target asset under /content/dam"),
        notes: "Use deterministic rendition names so automation can safely replace expected outputs.",
      };
    },
  },
  {
    name: "aem_renditions_delete",
    description: "Build a request to delete a rendition in AEM Assets HTTP API.",
    category: "renditions",
    inputSchema: objectSchema(
      {
        assetPath: stringSchema("Asset path relative to /content/dam", { minLength: 1 }),
        renditionName: stringSchema("Rendition name to delete", { minLength: 1 }),
        baseUrl: stringSchema("Optional AEM author base URL", { pattern: "^https?://" }),
      },
      ["assetPath", "renditionName"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const assetPath = getRepositoryPath(args, "assetPath");
      const renditionName = getString(args, "renditionName");
      const endpoint = toApiAssetsEndpoint(baseUrl, `${assetPath}/renditions/${renditionName}`, false);

      return {
        endpoint,
        method: "DELETE",
        headers: {
          Authorization: "Bearer {accessToken}",
        },
        pathParams: { assetPath, renditionName },
        queryParams: {},
        body: null,
        description: `Delete rendition '${renditionName}' from '/content/dam/${assetPath}'.`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#delete-a-folder-asset-or-rendition",
        codeExample: `await fetch('${endpoint}', {\n  method: 'DELETE',\n  headers: { Authorization: 'Bearer {accessToken}' }\n});`,
        requiredAccess: requiredAccess("Delete permissions for renditions on the target asset under /content/dam"),
        notes: "Avoid deleting 'original' rendition unless your lifecycle rules explicitly require it.",
      };
    },
  },
];

export const searchTools: ToolDefinition[] = [
  {
    name: "aem_search_query_builder_assets",
    description:
      "Build a Query Builder request for discovering assets (path, fulltext, metadata predicates, pagination, and sorting).",
    category: "search",
    inputSchema: objectSchema(
      {
        path: stringSchema("Repository path to search within (relative to /content/dam, example: marketing/campaigns)"),
        fulltext: stringSchema("Optional fulltext search phrase"),
        limit: numberSchema("Optional page size (default: 50)", { integer: true, minimum: 0, maximum: 1000 }),
        offset: numberSchema("Optional page offset (default: 0)", { integer: true, minimum: 0 }),
        orderBy: stringSchema("Optional sort property, example: @jcr:content/metadata/dc:modified"),
        orderDirection: stringSchema("Optional sort direction: asc or desc (default: desc)", { enum: ["asc", "desc"] }),
        includeTotal: booleanSchema("Optional: include p.guessTotal=true for approximate totals"),
        metadataEquals: objectSchema({}, [], true),
        baseUrl: stringSchema("Optional AEM author base URL", { pattern: "^https?://" }),
      },
      ["path"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const path = getRepositoryPath(args, "path");
      const fulltext = getOptionalString(args, "fulltext");
      const limit = args.limit === undefined ? 50 : getNonNegativeInteger(args, "limit");
      const offset = args.offset === undefined ? 0 : getNonNegativeInteger(args, "offset");
      const orderBy = getOptionalString(args, "orderBy");
      const orderDirection = (getOptionalString(args, "orderDirection") ?? "desc").toLowerCase();
      const includeTotal = getOptionalBoolean(args, "includeTotal") ?? false;

      ensureNonNegativeInteger(limit, "limit");
      ensureNonNegativeInteger(offset, "offset");

      if (orderDirection !== "asc" && orderDirection !== "desc") {
        throw new Error("'orderDirection' must be 'asc' or 'desc'.");
      }

      const normalizedPath = normalizeRepositoryPath(path);
      const damPath = normalizedPath ? `/content/dam/${normalizedPath}` : "/content/dam";

      const queryParams: Record<string, string> = {
        path: damPath,
        type: "dam:Asset",
        "p.limit": String(limit),
        "p.offset": String(offset),
      };

      if (fulltext) {
        queryParams.fulltext = fulltext;
      }

      if (orderBy) {
        queryParams.orderby = orderBy;
        queryParams["orderby.sort"] = orderDirection;
      }

      if (includeTotal) {
        queryParams["p.guessTotal"] = "true";
      }

      const metadataEqualsRaw = args.metadataEquals;
      if (metadataEqualsRaw !== undefined) {
        const metadataEquals = assertRecord(metadataEqualsRaw, "metadataEquals");
        let idx = 1;

        for (const [field, value] of Object.entries(metadataEquals)) {
          if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
            throw new Error(
              `metadataEquals.${field} must be a string, number, or boolean. Arrays and objects are not supported.`
            );
          }

          queryParams[`${idx}_property`] = field;
          queryParams[`${idx}_property.value`] = String(value);
          idx += 1;
        }
      }

      const endpoint = `${baseUrl}/bin/querybuilder.json`;

      return {
        endpoint,
        method: "GET",
        headers: {
          Authorization: "Bearer {accessToken}",
          Accept: "application/json",
        },
        pathParams: {},
        queryParams,
        body: null,
        description: "Search DAM assets with Query Builder predicates.",
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/full-stack/search/query-builder-api",
        codeExample: `const params = new URLSearchParams(${JSON.stringify(queryParams, null, 2)});\nconst response = await fetch('${endpoint}?${"${params.toString()}"}', {\n  method: 'GET',\n  headers: { Authorization: 'Bearer {accessToken}', Accept: 'application/json' }\n});\nconst data = await response.json();`,
        requiredAccess: requiredAccess("Read access to queried DAM paths and metadata fields"),
        notes:
          "This uses AEM Query Builder endpoint (/bin/querybuilder.json). Use metadata fields like jcr:content/metadata/dc:title for stable predicate paths.",
      };
    },
  },
  {
    name: "aem_search_hierarchy_fast_page",
    description:
      "Build a high-throughput Query Builder request for quickly reading assets from deep folder hierarchies with pagination-safe defaults.",
    category: "search",
    inputSchema: objectSchema(
      {
        path: stringSchema("Root path to scan (relative to /content/dam, example: marketing/global)", { minLength: 1 }),
        pageSize: numberSchema("Optional page size (default: 200)", { integer: true, minimum: 0, maximum: 2000 }),
        offset: numberSchema("Optional page offset (default: 0)", { integer: true, minimum: 0 }),
        fulltext: stringSchema("Optional fulltext filter"),
        propertyPaths: arraySchema(
          "Optional selective fields for p.properties (default: jcr:path jcr:content/metadata/dc:title jcr:content/metadata/dc:format)",
          stringSchema("Property path")
        ),
        includeNodeDepth: numberSchema(
          "Optional child node depth. When set, p.hits=full and p.nodedepth are enabled (use cautiously for payload size).",
          { integer: true, minimum: 0 }
        ),
        guessTotal: booleanSchema("Optional: include p.guessTotal=true (default: true)"),
        guessTotalLimit: numberSchema("Optional: set p.guessTotal to a numeric ceiling, example 1000", {
          integer: true,
          minimum: 0,
        }),
        sortBy: stringSchema("Optional sort field (default: @jcr:content/jcr:lastModified)"),
        sortDirection: stringSchema("Optional sort direction: asc or desc (default: desc)", { enum: ["asc", "desc"] }),
        baseUrl: stringSchema("Optional AEM author base URL", { pattern: "^https?://" }),
      },
      ["path"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const path = getRepositoryPath(args, "path");
      const pageSize = args.pageSize === undefined ? 200 : getNonNegativeInteger(args, "pageSize");
      const offset = args.offset === undefined ? 0 : getNonNegativeInteger(args, "offset");
      const fulltext = getOptionalString(args, "fulltext");
      const propertyPaths = parseOptionalStringArray(args, "propertyPaths") ?? [
        "jcr:path",
        "jcr:content/metadata/dc:title",
        "jcr:content/metadata/dc:format",
      ];
      const includeNodeDepth =
        args.includeNodeDepth === undefined ? undefined : getNonNegativeInteger(args, "includeNodeDepth");
      const guessTotal = getOptionalBoolean(args, "guessTotal") ?? true;
      const guessTotalLimit =
        args.guessTotalLimit === undefined ? undefined : getNonNegativeInteger(args, "guessTotalLimit");
      const sortBy = getOptionalString(args, "sortBy") ?? "@jcr:content/jcr:lastModified";
      const sortDirection = (getOptionalString(args, "sortDirection") ?? "desc").toLowerCase();

      ensureNonNegativeInteger(pageSize, "pageSize");
      ensureNonNegativeInteger(offset, "offset");

      if (sortDirection !== "asc" && sortDirection !== "desc") {
        throw new Error("'sortDirection' must be 'asc' or 'desc'.");
      }

      if (includeNodeDepth !== undefined) {
        ensureNonNegativeInteger(includeNodeDepth, "includeNodeDepth");
      }

      if (guessTotalLimit !== undefined) {
        ensureNonNegativeInteger(guessTotalLimit, "guessTotalLimit");
      }

      const normalizedPath = normalizeRepositoryPath(path);
      const damPath = normalizedPath ? `/content/dam/${normalizedPath}` : "/content/dam";

      const queryParams: Record<string, string> = {
        path: damPath,
        type: "dam:Asset",
        "p.limit": String(pageSize),
        "p.offset": String(offset),
        orderby: sortBy,
        "orderby.sort": sortDirection,
      };

      if (fulltext) {
        queryParams.fulltext = fulltext;
      }

      if (includeNodeDepth !== undefined) {
        queryParams["p.hits"] = "full";
        queryParams["p.nodedepth"] = String(includeNodeDepth);
      } else {
        queryParams["p.hits"] = "selective";
        queryParams["p.properties"] = propertyPaths.join(" ");
      }

      if (guessTotalLimit !== undefined) {
        queryParams["p.guessTotal"] = String(guessTotalLimit);
      } else if (guessTotal) {
        queryParams["p.guessTotal"] = "true";
      }

      const endpoint = `${baseUrl}/bin/querybuilder.json`;
      const nextOffset = offset + pageSize;

      return {
        endpoint,
        method: "GET",
        headers: {
          Authorization: "Bearer {accessToken}",
          Accept: "application/json",
        },
        pathParams: {},
        queryParams,
        body: null,
        pagination: {
          currentOffset: offset,
          pageSize,
          nextOffset,
          nextPageHint: `Set offset=${nextOffset} for the next page.`,
          guessTotalStrategy:
            guessTotalLimit !== undefined
              ? `p.guessTotal=${guessTotalLimit}`
              : guessTotal
              ? "p.guessTotal=true"
              : "disabled",
        },
        description: "Fast paged retrieval across deep DAM hierarchies using Query Builder.",
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/full-stack/search/query-builder-api#implementing-pagination",
        codeExample: `const params = new URLSearchParams(${JSON.stringify(queryParams, null, 2)});\nconst response = await fetch('${endpoint}?${"${params.toString()}"}', {\n  method: 'GET',\n  headers: { Authorization: 'Bearer {accessToken}', Accept: 'application/json' }\n});\nconst data = await response.json();\n// If data.more === true, call again with offset=${nextOffset}.`,
        requiredAccess: requiredAccess("Read access to the target DAM subtree and requested metadata properties"),
        notes:
          "Use selective hits for throughput, full hits only when node-level details are required. Pair with checkpointing (last successful offset or timestamp window).",
      };
    },
  },
  {
    name: "aem_search_query_builder_delta_window",
    description:
      "Build a Query Builder request for incremental sync windows (find assets modified between timestamps).",
    category: "search",
    inputSchema: objectSchema(
      {
        path: stringSchema("Repository path to search within (relative to /content/dam)"),
        modifiedFrom: stringSchema("Inclusive ISO timestamp lower bound, example: 2026-04-01T00:00:00.000Z", {
          format: "date-time",
          pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$",
        }),
        modifiedTo: stringSchema("Exclusive ISO timestamp upper bound, example: 2026-04-20T00:00:00.000Z", {
          format: "date-time",
          pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$",
        }),
        limit: numberSchema("Optional page size (default: 200)", { integer: true, minimum: 0, maximum: 2000 }),
        offset: numberSchema("Optional page offset (default: 0)", { integer: true, minimum: 0 }),
        baseUrl: stringSchema("Optional AEM author base URL", { pattern: "^https?://" }),
      },
      ["path", "modifiedFrom", "modifiedTo"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const path = getRepositoryPath(args, "path");
      const modifiedFrom = getIsoTimestamp(args, "modifiedFrom");
      const modifiedTo = getIsoTimestamp(args, "modifiedTo");
      const limit = args.limit === undefined ? 200 : getNonNegativeInteger(args, "limit");
      const offset = args.offset === undefined ? 0 : getNonNegativeInteger(args, "offset");

      if (Date.parse(modifiedFrom) >= Date.parse(modifiedTo)) {
        throw new Error("'modifiedFrom' must be earlier than 'modifiedTo'.");
      }

      ensureNonNegativeInteger(limit, "limit");
      ensureNonNegativeInteger(offset, "offset");

      const normalizedPath = normalizeRepositoryPath(path);
      const damPath = normalizedPath ? `/content/dam/${normalizedPath}` : "/content/dam";

      const queryParams: Record<string, string> = {
        path: damPath,
        type: "dam:Asset",
        "1_property": "jcr:content/jcr:lastModified",
        "1_property.operation": "greater_or_equal",
        "1_property.value": modifiedFrom,
        "2_property": "jcr:content/jcr:lastModified",
        "2_property.operation": "less",
        "2_property.value": modifiedTo,
        "p.limit": String(limit),
        "p.offset": String(offset),
        orderby: "@jcr:content/jcr:lastModified",
        "orderby.sort": "asc",
      };

      const endpoint = `${baseUrl}/bin/querybuilder.json`;

      return {
        endpoint,
        method: "GET",
        headers: {
          Authorization: "Bearer {accessToken}",
          Accept: "application/json",
        },
        pathParams: {},
        queryParams,
        body: null,
        description: "Search assets modified within a window for incremental sync jobs.",
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/full-stack/search/query-builder-api",
        codeExample: `const params = new URLSearchParams(${JSON.stringify(queryParams, null, 2)});\nconst response = await fetch('${endpoint}?${"${params.toString()}"}', {\n  method: 'GET',\n  headers: { Authorization: 'Bearer {accessToken}', Accept: 'application/json' }\n});\nconst data = await response.json();`,
        requiredAccess: requiredAccess("Read access to queried DAM paths and jcr:lastModified"),
        notes:
          "Prefer sorted windows by lastModified for stable replayable sync loops. Keep checkpoints externally in your integration store.",
      };
    },
  },
];
