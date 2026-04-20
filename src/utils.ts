import type { JsonObject } from "./types.js";

export const DEFAULT_AEM_BASE_URL = "https://author.example.adobeaemcloud.com";

const ISO_8601_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export type AemRuntimeContext = {
  baseUrl: string;
  cloudFlavor: "cloud_service" | "ams" | "on_prem";
  authMode: "ims_bearer_token" | "service_credentials" | "session_cookie";
  defaultDamRoot: string;
  retryPolicy: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitter: boolean;
  };
};

const DEFAULT_RUNTIME_CONTEXT: AemRuntimeContext = {
  baseUrl: DEFAULT_AEM_BASE_URL,
  cloudFlavor: "cloud_service",
  authMode: "ims_bearer_token",
  defaultDamRoot: "",
  retryPolicy: {
    maxAttempts: 5,
    baseDelayMs: 250,
    maxDelayMs: 5000,
    jitter: true,
  },
};

let runtimeContext: AemRuntimeContext = {
  ...DEFAULT_RUNTIME_CONTEXT,
  retryPolicy: { ...DEFAULT_RUNTIME_CONTEXT.retryPolicy },
};

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

export function getPositiveInteger(args: JsonObject, key: string): number {
  const value = args[key];
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`'${key}' must be a positive integer.`);
  }
  return value as number;
}

export function getNonNegativeInteger(args: JsonObject, key: string): number {
  const value = args[key];
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`'${key}' must be a non-negative integer.`);
  }
  return value as number;
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

function sanitizeRepositoryPath(rawPath: string): string {
  let path = rawPath.trim();

  path = path.replace(/^https?:\/\/[^/]+/i, "");
  path = path.replace(/^\/api\/assets\/?/i, "");
  path = path.replace(/^\/content\/dam\/?/i, "");
  path = path.replace(/^\/+|\/+$/g, "");

  if (path.includes("\\")) {
    throw new Error("Repository paths must use '/' separators.");
  }

  if (/[?#]/.test(path)) {
    throw new Error("Repository paths cannot include query strings or hash fragments.");
  }

  if (path.split("/").some((segment) => segment === "..")) {
    throw new Error("Repository paths cannot include '..' traversal segments.");
  }

  return path;
}

function applyDefaultDamRoot(path: string): string {
  if (!runtimeContext.defaultDamRoot) {
    return path;
  }

  const defaultRoot = sanitizeRepositoryPath(runtimeContext.defaultDamRoot);
  if (!defaultRoot) {
    return path;
  }

  if (!path) {
    return defaultRoot;
  }

  if (path === defaultRoot || path.startsWith(`${defaultRoot}/`)) {
    return path;
  }

  return `${defaultRoot}/${path}`;
}

export function getRepositoryPath(args: JsonObject, key: string): string {
  const value = getString(args, key);
  const normalized = sanitizeRepositoryPath(value);

  if (!normalized) {
    throw new Error(`'${key}' must be a non-empty path relative to /content/dam.`);
  }

  return normalized;
}

export function getOptionalRepositoryPath(args: JsonObject, key: string): string | undefined {
  const value = getOptionalString(args, key);
  if (value === undefined) {
    return undefined;
  }

  return sanitizeRepositoryPath(value);
}

export function getFileName(args: JsonObject, key: string): string {
  const value = getString(args, key);
  if (value.includes("/") || value.includes("\\")) {
    throw new Error(`'${key}' must be a file name, not a path.`);
  }
  if (value === "." || value === "..") {
    throw new Error(`'${key}' must be a valid file name.`);
  }
  return value;
}

export function getIsoTimestamp(args: JsonObject, key: string): string {
  const value = getString(args, key);

  if (!ISO_8601_UTC_REGEX.test(value)) {
    throw new Error(`'${key}' must be an ISO-8601 UTC timestamp like 2026-04-20T12:30:00.000Z.`);
  }

  const epoch = Date.parse(value);
  if (Number.isNaN(epoch)) {
    throw new Error(`'${key}' is not a valid timestamp.`);
  }

  return value;
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
  const baseUrl = getOptionalString(args, "baseUrl") ?? runtimeContext.baseUrl;
  return baseUrl.replace(/\/+$/, "");
}

export function normalizeRepositoryPath(rawPath: string): string {
  const sanitized = sanitizeRepositoryPath(rawPath);
  return applyDefaultDamRoot(sanitized);
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

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("'baseUrl' must start with http:// or https://.");
  }
  return trimmed;
}

export function getAemRuntimeContext(): AemRuntimeContext {
  return {
    ...runtimeContext,
    retryPolicy: { ...runtimeContext.retryPolicy },
  };
}

export function setAemRuntimeContext(update: Partial<AemRuntimeContext>): AemRuntimeContext {
  if (update.baseUrl !== undefined) {
    runtimeContext.baseUrl = normalizeBaseUrl(update.baseUrl);
  }

  if (update.cloudFlavor !== undefined) {
    runtimeContext.cloudFlavor = update.cloudFlavor;
  }

  if (update.authMode !== undefined) {
    runtimeContext.authMode = update.authMode;
  }

  if (update.defaultDamRoot !== undefined) {
    runtimeContext.defaultDamRoot = sanitizeRepositoryPath(update.defaultDamRoot);
  }

  if (update.retryPolicy !== undefined) {
    const retryPolicy = update.retryPolicy;
    if (!Number.isInteger(retryPolicy.maxAttempts) || retryPolicy.maxAttempts < 1 || retryPolicy.maxAttempts > 20) {
      throw new Error("'retryPolicy.maxAttempts' must be an integer between 1 and 20.");
    }
    if (!Number.isInteger(retryPolicy.baseDelayMs) || retryPolicy.baseDelayMs < 0) {
      throw new Error("'retryPolicy.baseDelayMs' must be a non-negative integer.");
    }
    if (!Number.isInteger(retryPolicy.maxDelayMs) || retryPolicy.maxDelayMs < retryPolicy.baseDelayMs) {
      throw new Error("'retryPolicy.maxDelayMs' must be an integer greater than or equal to baseDelayMs.");
    }

    runtimeContext.retryPolicy = {
      maxAttempts: retryPolicy.maxAttempts,
      baseDelayMs: retryPolicy.baseDelayMs,
      maxDelayMs: retryPolicy.maxDelayMs,
      jitter: retryPolicy.jitter,
    };
  }

  return getAemRuntimeContext();
}

export function resetAemRuntimeContext(): AemRuntimeContext {
  runtimeContext = {
    ...DEFAULT_RUNTIME_CONTEXT,
    retryPolicy: { ...DEFAULT_RUNTIME_CONTEXT.retryPolicy },
  };

  return getAemRuntimeContext();
}
