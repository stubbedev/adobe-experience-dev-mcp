import type { ToolDefinition } from "../types.js";
import { arraySchema, booleanSchema, numberSchema, objectSchema, stringSchema } from "../schemas.js";
import {
  buildFormHeaders,
  getFileName,
  getBaseUrl,
  getNonNegativeInteger,
  getOptionalBoolean,
  getOptionalString,
  getPositiveInteger,
  getRepositoryPath,
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
        folderPath: stringSchema(
          "Destination DAM folder path, relative to /content/dam (example: marketing/campaigns/2026)",
          { minLength: 1 }
        ),
        fileName: stringSchema("Asset file name (example: hero-banner.jpg)", { minLength: 1 }),
        fileSize: numberSchema("Asset file size in bytes", { integer: true, minimum: 1 }),
        baseUrl: stringSchema("Optional AEM author base URL (defaults to https://author.example.adobeaemcloud.com)", {
          pattern: "^https?://",
        }),
      },
      ["folderPath", "fileName", "fileSize"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const folderPath = getRepositoryPath(args, "folderPath");
      const fileName = getFileName(args, "fileName");
      const fileSize = getPositiveInteger(args, "fileSize");

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
        fileName: stringSchema("File name returned by initiate response", { minLength: 1 }),
        mimeType: stringSchema("MIME type returned by initiate response", {
          pattern: "^[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+$",
        }),
        uploadToken: stringSchema("uploadToken returned by initiate response", { minLength: 1 }),
        createVersion: booleanSchema("Optional: create a new version if asset exists"),
        replace: booleanSchema("Optional: replace existing asset by deleting and recreating"),
        versionLabel: stringSchema("Optional version label when createVersion=true"),
        versionComment: stringSchema("Optional version comment when createVersion=true"),
        uploadDuration: numberSchema("Optional total upload duration in milliseconds", {
          integer: true,
          minimum: 0,
        }),
        fileSize: numberSchema("Optional file size in bytes for transfer analysis", {
          integer: true,
          minimum: 1,
        }),
        baseUrl: stringSchema("Optional AEM author base URL used when completeUri is relative", {
          pattern: "^https?://",
        }),
        initiateContract: objectSchema(
          {
            completeUri: stringSchema("completeURI returned by initiate response"),
            fileName: stringSchema("fileName returned by initiate response"),
            uploadToken: stringSchema("uploadToken returned by initiate response"),
          },
          ["completeUri", "fileName", "uploadToken"],
          false
        ),
      },
      ["completeUri", "fileName", "mimeType", "uploadToken"]
    ),
    handler: (args) => {
      const baseUrl = getBaseUrl(args);
      const completeUri = getString(args, "completeUri");
      const fileName = getFileName(args, "fileName");
      const mimeType = getString(args, "mimeType");
      const uploadToken = getString(args, "uploadToken");

      const createVersion = getOptionalBoolean(args, "createVersion");
      const replace = getOptionalBoolean(args, "replace");
      const versionLabel = getOptionalString(args, "versionLabel");
      const versionComment = getOptionalString(args, "versionComment");
      const uploadDuration = args.uploadDuration === undefined ? undefined : getNonNegativeInteger(args, "uploadDuration");
      const fileSize = args.fileSize === undefined ? undefined : getPositiveInteger(args, "fileSize");

      const endpoint = resolveCompleteUri(baseUrl, completeUri);

      const initiateContractRaw = args.initiateContract;
      const contractMismatches: string[] = [];

      if (initiateContractRaw !== undefined) {
        if (!initiateContractRaw || typeof initiateContractRaw !== "object" || Array.isArray(initiateContractRaw)) {
          throw new Error("'initiateContract' must be an object.");
        }

        const initiateContract = initiateContractRaw as Record<string, unknown>;
        const contractCompleteUriRaw = initiateContract.completeUri;
        const contractFileNameRaw = initiateContract.fileName;
        const contractUploadTokenRaw = initiateContract.uploadToken;

        if (typeof contractCompleteUriRaw !== "string" || contractCompleteUriRaw.trim().length === 0) {
          throw new Error("'initiateContract.completeUri' must be a non-empty string.");
        }
        if (typeof contractFileNameRaw !== "string" || contractFileNameRaw.trim().length === 0) {
          throw new Error("'initiateContract.fileName' must be a non-empty string.");
        }
        if (typeof contractUploadTokenRaw !== "string" || contractUploadTokenRaw.trim().length === 0) {
          throw new Error("'initiateContract.uploadToken' must be a non-empty string.");
        }

        const contractEndpoint = resolveCompleteUri(baseUrl, contractCompleteUriRaw.trim());

        if (contractEndpoint !== endpoint) {
          contractMismatches.push("completeUri does not match initiate response completeUri.");
        }
        if (contractFileNameRaw.trim() !== fileName) {
          contractMismatches.push("fileName does not match initiate response fileName.");
        }
        if (contractUploadTokenRaw.trim() !== uploadToken) {
          contractMismatches.push("uploadToken does not match initiate response uploadToken.");
        }
      }

      if (contractMismatches.length > 0) {
        throw new Error(`Cross-step contract validation failed: ${contractMismatches.join(" ")}`);
      }

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
        contractCheck:
          initiateContractRaw === undefined
            ? {
                validated: false,
                message:
                  "No initiateContract provided. For stricter sequencing accuracy, pass initiateContract from the upload initiate response.",
              }
            : {
                validated: true,
                message: "completeUri, fileName, and uploadToken match the initiate response contract.",
              },
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
        fileSize: numberSchema("Total file size in bytes", { integer: true, minimum: 1 }),
        maxPartSize: numberSchema("maxPartSize from initiate response", { integer: true, minimum: 1 }),
        minPartSize: numberSchema("minPartSize from initiate response", { integer: true, minimum: 1 }),
        uploadUris: arraySchema("Optional uploadURIs from initiate response", stringSchema("Upload URI", { minLength: 1 })),
      },
      ["fileSize", "maxPartSize", "minPartSize"]
    ),
    handler: (args) => {
      const fileSize = getPositiveInteger(args, "fileSize");
      const maxPartSize = getPositiveInteger(args, "maxPartSize");
      const minPartSize = getPositiveInteger(args, "minPartSize");

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
        uriCoverage:
          uploadUris.length === 0
            ? "unbound"
            : uploadUris.length === parts.length
            ? "exact"
            : "mismatch",
        uriCoverageNote:
          uploadUris.length === 0
            ? "No uploadUris provided; assign in order from initiate response."
            : uploadUris.length === parts.length
            ? "uploadUris count matches planned parts."
            : `uploadUris count (${uploadUris.length}) does not match planned parts (${parts.length}).`,
        parts: partAssignments,
        notes:
          "Each non-final part must be >= minPartSize and <= maxPartSize. Final part can be smaller than minPartSize. Use uploadURIs in order.",
      };
    },
  },
];
