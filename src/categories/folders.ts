import type { ToolDefinition } from "../types.js";
import { booleanSchema, objectSchema, stringSchema } from "../schemas.js";
import {
  buildJsonHeaders,
  getBaseUrl,
  getOptionalBoolean,
  getOptionalString,
  getString,
  joinRepositoryPath,
  requiredAccess,
  toApiAssetsEndpoint,
  toApiAssetsRelativePath,
} from "../utils.js";

function getDepth(args: Record<string, unknown>): string {
  const value = getOptionalString(args, "depth") ?? "infinity";
  if (value !== "0" && value !== "infinity") {
    throw new Error("'depth' must be either '0' or 'infinity'.");
  }
  return value;
}

export const foldersTools: ToolDefinition[] = [
  {
    name: "aem_folders_list",
    description: "Build a request to list folder contents in AEM Assets HTTP API.",
    category: "folders",
    inputSchema: objectSchema(
      {
        folderPath: stringSchema("Folder path relative to /content/dam. Leave empty to list DAM root."),
        baseUrl: stringSchema("Optional AEM author base URL"),
      },
      []
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const folderPath = getOptionalString(args, "folderPath") ?? "";
      const endpoint = toApiAssetsEndpoint(baseUrl, folderPath, true);

      return {
        endpoint,
        method: "GET",
        headers: {
          Authorization: "Bearer {accessToken}",
          Accept: "application/json",
        },
        pathParams: { folderPath },
        queryParams: {},
        body: null,
        description: folderPath
          ? `List folder contents for '/content/dam/${folderPath}'.`
          : "List folder contents for '/content/dam'.",
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#retrieve-a-folder-listing",
        codeExample: `const response = await fetch('${endpoint}', {\n  method: 'GET',\n  headers: { Authorization: 'Bearer {accessToken}', Accept: 'application/json' }\n});\nconst data = await response.json();`,
        requiredAccess: requiredAccess("Read access on the requested folder path under /content/dam"),
        notes: "AEM returns Siren-style entities for child folders and assets.",
      };
    },
  },
  {
    name: "aem_folders_create",
    description: "Build a request to create a folder in AEM Assets HTTP API.",
    category: "folders",
    inputSchema: objectSchema(
      {
        parentPath: stringSchema("Parent folder path relative to /content/dam. Use empty string for DAM root."),
        folderName: stringSchema("Name of the folder to create"),
        title: stringSchema("Optional display title (jcr:title)"),
        baseUrl: stringSchema("Optional AEM author base URL"),
      },
      ["folderName"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const parentPath = getOptionalString(args, "parentPath") ?? "";
      const folderName = getString(args, "folderName");
      const title = getOptionalString(args, "title") ?? folderName;

      const folderPath = joinRepositoryPath(parentPath, folderName);
      const endpoint = toApiAssetsEndpoint(baseUrl, folderPath, false);

      const body = {
        class: "assetFolder",
        properties: {
          title,
        },
      };

      return {
        endpoint,
        method: "POST",
        headers: buildJsonHeaders(),
        pathParams: { parentPath, folderName },
        queryParams: {},
        body,
        description: `Create folder '/content/dam/${folderPath}'.`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#create-a-folder",
        codeExample: `const response = await fetch('${endpoint}', {\n  method: 'POST',\n  headers: {\n    Authorization: 'Bearer {accessToken}',\n    Accept: 'application/json',\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify(${JSON.stringify(body, null, 2)})\n});`,
        requiredAccess: requiredAccess("Create folder permission at the target parent path under /content/dam"),
        notes: "The parent path must already exist; otherwise AEM can return a precondition error.",
      };
    },
  },
  {
    name: "aem_folders_copy",
    description: "Build a request to copy a folder in AEM Assets HTTP API.",
    category: "folders",
    inputSchema: objectSchema(
      {
        sourcePath: stringSchema("Source folder path relative to /content/dam"),
        destinationPath: stringSchema("Destination folder path relative to /content/dam"),
        overwrite: booleanSchema("Optional: set true to allow overwriting destination"),
        depth: stringSchema("Optional COPY depth: 'infinity' (default) or '0'"),
        baseUrl: stringSchema("Optional AEM author base URL"),
      },
      ["sourcePath", "destinationPath"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const sourcePath = getString(args, "sourcePath");
      const destinationPath = getString(args, "destinationPath");
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
        description: `Copy folder '/content/dam/${sourcePath}' to '/content/dam/${destinationPath}'.`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#copy-a-folder-or-an-asset",
        codeExample: `await fetch('${endpoint}', {\n  method: 'COPY',\n  headers: {\n    Authorization: 'Bearer {accessToken}',\n    'X-Destination': '${destinationHeader}',\n    'X-Depth': '${depth}',\n    'X-Overwrite': '${overwrite ? "T" : "F"}'\n  }\n});`,
        requiredAccess: requiredAccess("Read source folder and create permissions at destination path"),
        notes: "Use depth='0' to copy only folder properties, or 'infinity' for recursive copy.",
      };
    },
  },
  {
    name: "aem_folders_move",
    description: "Build a request to move a folder in AEM Assets HTTP API.",
    category: "folders",
    inputSchema: objectSchema(
      {
        sourcePath: stringSchema("Source folder path relative to /content/dam"),
        destinationPath: stringSchema("Destination folder path relative to /content/dam"),
        overwrite: booleanSchema("Optional: set true to force overwrite destination"),
        depth: stringSchema("Optional MOVE depth: 'infinity' (default) or '0'"),
        baseUrl: stringSchema("Optional AEM author base URL"),
      },
      ["sourcePath", "destinationPath"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const sourcePath = getString(args, "sourcePath");
      const destinationPath = getString(args, "destinationPath");
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
        description: `Move folder '/content/dam/${sourcePath}' to '/content/dam/${destinationPath}'.`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#move-a-folder-or-an-asset",
        codeExample: `await fetch('${endpoint}', {\n  method: 'MOVE',\n  headers: {\n    Authorization: 'Bearer {accessToken}',\n    'X-Destination': '${destinationHeader}',\n    'X-Depth': '${depth}',\n    'X-Overwrite': '${overwrite ? "T" : "F"}'\n  }\n});`,
        requiredAccess: requiredAccess("Delete/move permission on source and create permission on destination"),
        notes: "For larger trees, MOVE can be long-running depending on repository size and workflow load.",
      };
    },
  },
  {
    name: "aem_folders_delete",
    description: "Build a request to delete a folder tree in AEM Assets HTTP API.",
    category: "folders",
    inputSchema: objectSchema(
      {
        folderPath: stringSchema("Folder path relative to /content/dam"),
        baseUrl: stringSchema("Optional AEM author base URL"),
      },
      ["folderPath"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const folderPath = getString(args, "folderPath");
      const endpoint = toApiAssetsEndpoint(baseUrl, folderPath, false);

      return {
        endpoint,
        method: "DELETE",
        headers: {
          Authorization: "Bearer {accessToken}",
        },
        pathParams: { folderPath },
        queryParams: {},
        body: null,
        description: `Delete folder '/content/dam/${folderPath}' (including descendants).`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets#delete-a-folder-asset-or-rendition",
        codeExample: `await fetch('${endpoint}', {\n  method: 'DELETE',\n  headers: { Authorization: 'Bearer {accessToken}' }\n});`,
        requiredAccess: requiredAccess("Delete permission for the target folder path under /content/dam"),
        notes: "Deletion is recursive for folder paths. Use carefully in production.",
      };
    },
  },
];
