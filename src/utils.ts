import type { JsonObject } from "./types.js";

export const DEFAULT_AEM_BASE_URL = "https://author.example.adobeaemcloud.com";

export function assertRecord(value: unknown, fieldName: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`'${fieldName}' must be an object.`);
  }

  return value as JsonObject;
}

export function getString(args: JsonObject, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`'${key}' must be a non-empty string.`);
  }
  return value.trim();
}

export function getOptionalString(args: JsonObject, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`'${key}' must be a string.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getNumber(args: JsonObject, key: string): number {
  const value = args[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`'${key}' must be a number.`);
  }
  return value;
}

export function getOptionalNumber(args: JsonObject, key: string): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`'${key}' must be a number.`);
  }
  return value;
}

export function getOptionalBoolean(args: JsonObject, key: string): boolean | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`'${key}' must be a boolean.`);
  }
  return value;
}

export function getBoolean(args: JsonObject, key: string): boolean {
  const value = args[key];
  if (typeof value !== "boolean") {
    throw new Error(`'${key}' must be a boolean.`);
  }
  return value;
}

export function getArray(args: JsonObject, key: string): unknown[] {
  const value = args[key];
  if (!Array.isArray(value)) {
    throw new Error(`'${key}' must be an array.`);
  }
  return value;
}

export function getBaseUrl(args: JsonObject): string {
  const baseUrl = getOptionalString(args, "baseUrl") ?? DEFAULT_AEM_BASE_URL;
  return baseUrl.replace(/\/+$/, "");
}

export function normalizeRepositoryPath(rawPath: string): string {
  let path = rawPath.trim();

  path = path.replace(/^https?:\/\/[^/]+/i, "");
  path = path.replace(/^\/api\/assets\/?/i, "");
  path = path.replace(/^\/content\/dam\/?/i, "");
  path = path.replace(/^\/+|\/+$/g, "");

  return path;
}

export function encodePathSegments(path: string): string {
  if (!path) {
    return "";
  }

  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function toApiAssetsEndpoint(baseUrl: string, repoPath: string, withJsonSuffix: boolean): string {
  const normalized = normalizeRepositoryPath(repoPath);
  const encoded = encodePathSegments(normalized);
  const pathSegment = encoded ? `/${encoded}` : "";
  const suffix = withJsonSuffix ? ".json" : "";
  return `${baseUrl}/api/assets${pathSegment}${suffix}`;
}

export function toDamFolder(baseUrl: string, folderPath: string, selector: string): string {
  const normalized = normalizeRepositoryPath(folderPath);
  const encoded = encodePathSegments(normalized);
  const pathSegment = encoded ? `/${encoded}` : "";
  return `${baseUrl}/content/dam${pathSegment}${selector}`;
}

export function toApiAssetsRelativePath(repoPath: string): string {
  const normalized = normalizeRepositoryPath(repoPath);
  const encoded = encodePathSegments(normalized);
  const pathSegment = encoded ? `/${encoded}` : "";
  return `/api/assets${pathSegment}`;
}

export function joinRepositoryPath(parentPath: string, childName: string): string {
  const parent = normalizeRepositoryPath(parentPath);
  const child = normalizeRepositoryPath(childName);

  if (!child) {
    throw new Error("'folderName' must be a non-empty path segment.");
  }

  return parent ? `${parent}/${child}` : child;
}

export function buildJsonHeaders(): Record<string, string> {
  return {
    Authorization: "Bearer {accessToken}",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export function buildFormHeaders(includeAffinityCookie = false): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: "Bearer {accessToken}",
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  };

  if (includeAffinityCookie) {
    headers["Affinity-cookie"] = "{optionalAffinityCookieFromInitiateResponse}";
  }

  return headers;
}

export function requiredAccess(requiredPermissionHint: string): Record<string, unknown> {
  return {
    authentication: ["Adobe IMS Bearer token with access to the target AEM environment"],
    aemPermissions: [requiredPermissionHint],
  };
}

export function stringifyResponsePayload(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  return JSON.stringify(payload, null, 2);
}
