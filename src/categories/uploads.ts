import type { ToolDefinition } from "../types.js";
import { arraySchema, booleanSchema, numberSchema, objectSchema, stringSchema } from "../schemas.js";
import {
  buildFormHeaders,
  getBaseUrl,
  getNumber,
  getOptionalBoolean,
  getOptionalNumber,
  getOptionalString,
  getString,
  requiredAccess,
  toDamFolder,
} from "../utils.js";

function resolveCompleteUri(baseUrl: string, completeUri: string): string {
  if (/^https?:\/\//i.test(completeUri)) {
    return completeUri;
  }

  if (completeUri.startsWith("/")) {
    return `${baseUrl}${completeUri}`;
  }

  return `${baseUrl}/${completeUri}`;
}

function createUploadPartPlan(fileSize: number, maxPartSize: number, minPartSize: number): Array<Record<string, number>> {
  if (!Number.isInteger(fileSize) || fileSize <= 0) {
    throw new Error("'fileSize' must be a positive integer.");
  }

  if (!Number.isInteger(maxPartSize) || maxPartSize <= 0) {
    throw new Error("'maxPartSize' must be a positive integer.");
  }

  if (!Number.isInteger(minPartSize) || minPartSize <= 0) {
    throw new Error("'minPartSize' must be a positive integer.");
  }

  if (maxPartSize < minPartSize) {
    throw new Error("'maxPartSize' must be greater than or equal to 'minPartSize'.");
  }

  const parts: Array<Record<string, number>> = [];

  let offset = 0;
  let partNumber = 1;

  while (offset < fileSize) {
    const remaining = fileSize - offset;
    const partSize = Math.min(maxPartSize, remaining);

    parts.push({
      partNumber,
      startByte: offset,
      endByte: offset + partSize - 1,
      size: partSize,
    });

    offset += partSize;
    partNumber += 1;
  }

  if (parts.length > 1) {
    const nonFinalParts = parts.slice(0, -1);
    const tooSmall = nonFinalParts.find((part) => part.size < minPartSize);
    if (tooSmall) {
      throw new Error("Calculated part size violates minPartSize for a non-final part. Increase maxPartSize.");
    }
  }

  return parts;
}

export const uploadsTools: ToolDefinition[] = [
  {
    name: "aem_upload_initiate",
    description:
      "Build the direct binary upload initiate request for AEM as a Cloud Service. Use this before uploading file bytes to returned uploadURIs.",
    category: "uploads",
    inputSchema: objectSchema(
      {
        folderPath: stringSchema("Destination DAM folder path, relative to /content/dam (example: marketing/campaigns/2026)"),
        fileName: stringSchema("Asset file name (example: hero-banner.jpg)"),
        fileSize: numberSchema("Asset file size in bytes"),
        baseUrl: stringSchema("Optional AEM author base URL (defaults to https://author.example.adobeaemcloud.com)"),
      },
      ["folderPath", "fileName", "fileSize"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const folderPath = getString(args, "folderPath");
      const fileName = getString(args, "fileName");
      const fileSize = getNumber(args, "fileSize");

      if (!Number.isInteger(fileSize) || fileSize <= 0) {
        throw new Error("'fileSize' must be a positive integer.");
      }

      const endpoint = toDamFolder(baseUrl, folderPath, ".initiateUpload.json");
      const body = { fileName, fileSize };

      return {
        endpoint,
        method: "POST",
        headers: buildFormHeaders(),
        pathParams: { folderPath },
        queryParams: {},
        body,
        description: `Initiate direct binary upload for '${fileName}' into '/content/dam/${folderPath}'.`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/developer-reference-material-apis#initiate-upload",
        codeExample: `const params = new URLSearchParams();\nparams.set('fileName', '${fileName}');\nparams.set('fileSize', String(${fileSize}));\n\nconst response = await fetch('${endpoint}', {\n  method: 'POST',\n  headers: {\n    Authorization: 'Bearer {accessToken}',\n    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'\n  },\n  body: params\n});\nconst data = await response.json(); // contains completeURI, files[0].uploadURIs, uploadToken`,
        requiredAccess: requiredAccess("Create or update assets in the target folder under /content/dam"),
        notes:
          "A successful response includes completeURI, uploadToken, and uploadURIs. Upload bytes directly to uploadURIs before calling complete upload.",
      };
    },
  },
  {
    name: "aem_upload_complete",
    description:
      "Build the direct binary upload complete request for AEM as a Cloud Service. Call this after all bytes are uploaded to uploadURIs.",
    category: "uploads",
    inputSchema: objectSchema(
      {
        completeUri: stringSchema("completeURI from initiate response; can be absolute or relative"),
        fileName: stringSchema("File name returned by initiate response"),
        mimeType: stringSchema("MIME type returned by initiate response"),
        uploadToken: stringSchema("uploadToken returned by initiate response"),
        createVersion: booleanSchema("Optional: create a new version if asset exists"),
        replace: booleanSchema("Optional: replace existing asset by deleting and recreating"),
        versionLabel: stringSchema("Optional version label when createVersion=true"),
        versionComment: stringSchema("Optional version comment when createVersion=true"),
        uploadDuration: numberSchema("Optional total upload duration in milliseconds"),
        fileSize: numberSchema("Optional file size in bytes for transfer analysis"),
        baseUrl: stringSchema("Optional AEM author base URL used when completeUri is relative"),
      },
      ["completeUri", "fileName", "mimeType", "uploadToken"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const completeUri = getString(args, "completeUri");
      const fileName = getString(args, "fileName");
      const mimeType = getString(args, "mimeType");
      const uploadToken = getString(args, "uploadToken");

      const createVersion = getOptionalBoolean(args, "createVersion");
      const replace = getOptionalBoolean(args, "replace");
      const versionLabel = getOptionalString(args, "versionLabel");
      const versionComment = getOptionalString(args, "versionComment");
      const uploadDuration = getOptionalNumber(args, "uploadDuration");
      const fileSize = getOptionalNumber(args, "fileSize");

      const endpoint = resolveCompleteUri(baseUrl, completeUri);

      const body: Record<string, string | number | boolean> = {
        fileName,
        mimeType,
        uploadToken,
      };

      if (createVersion !== undefined) body.createVersion = createVersion;
      if (replace !== undefined) body.replace = replace;
      if (versionLabel !== undefined) body.versionLabel = versionLabel;
      if (versionComment !== undefined) body.versionComment = versionComment;
      if (uploadDuration !== undefined) body.uploadDuration = uploadDuration;
      if (fileSize !== undefined) body.fileSize = fileSize;

      return {
        endpoint,
        method: "POST",
        headers: buildFormHeaders(true),
        pathParams: { completeUri },
        queryParams: {},
        body,
        description: `Finalize direct binary upload for '${fileName}'.`,
        docsUrl:
          "https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/admin/developer-reference-material-apis#complete-upload",
        codeExample: `const params = new URLSearchParams();\nparams.set('fileName', '${fileName}');\nparams.set('mimeType', '${mimeType}');\nparams.set('uploadToken', '${uploadToken}');\n\nconst response = await fetch('${endpoint}', {\n  method: 'POST',\n  headers: {\n    Authorization: 'Bearer {accessToken}',\n    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',\n    'Affinity-cookie': '{optionalAffinityCookieFromInitiateResponse}'\n  },\n  body: params\n});`,
        requiredAccess: requiredAccess("Complete uploads into the target DAM path under /content/dam"),
        notes:
          "If completeURI is relative, this tool resolves it against baseUrl. In some environments, Affinity-cookie from initiate response improves reliability.",
      };
    },
  },
  {
    name: "aem_upload_plan_parts",
    description:
      "Plan binary part boundaries for direct upload using fileSize, minPartSize, and maxPartSize from initiate upload response.",
    category: "uploads",
    inputSchema: objectSchema(
      {
        fileSize: numberSchema("Total file size in bytes"),
        maxPartSize: numberSchema("maxPartSize from initiate response"),
        minPartSize: numberSchema("minPartSize from initiate response"),
        uploadUris: arraySchema("Optional uploadURIs from initiate response", stringSchema("Upload URI")),
      },
      ["fileSize", "maxPartSize", "minPartSize"]
    ),
    handler: (args) => {
      const fileSize = getNumber(args, "fileSize");
      const maxPartSize = getNumber(args, "maxPartSize");
      const minPartSize = getNumber(args, "minPartSize");

      const uploadUrisRaw = args.uploadUris;
      let uploadUris: string[] = [];

      if (uploadUrisRaw !== undefined) {
        if (!Array.isArray(uploadUrisRaw)) {
          throw new Error("'uploadUris' must be an array of strings when provided.");
        }
        uploadUris = uploadUrisRaw.map((value, index) => {
          if (typeof value !== "string" || value.trim().length === 0) {
            throw new Error(`'uploadUris[${index}]' must be a non-empty string.`);
          }
          return value;
        });
      }

      const parts = createUploadPartPlan(fileSize, maxPartSize, minPartSize);

      const partAssignments = parts.map((part) => {
        const uploadUri = uploadUris.length > 0 ? uploadUris[part.partNumber - 1] : undefined;
        return {
          ...part,
          uploadUri: uploadUri ?? "{assign uploadURIs in order from initiate response}",
        };
      });

      return {
        strategy: "Use maxPartSize for each part except the final part.",
        input: { fileSize, minPartSize, maxPartSize, uploadUriCount: uploadUris.length },
        totalParts: parts.length,
        parts: partAssignments,
        notes:
          "Each non-final part must be >= minPartSize and <= maxPartSize. Final part can be smaller than minPartSize. Use uploadURIs in order.",
      };
    },
  },
];
