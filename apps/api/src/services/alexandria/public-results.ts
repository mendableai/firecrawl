import { ApiError } from "@google-cloud/storage";
import { config } from "../../config";
import { storage } from "../../lib/gcs-jobs";
import { logger as _logger } from "../../lib/logger";
import type { ProviderCall } from "./contracts";
import {
  publicCapability,
  type PublicCapability,
  type PublicParamKind,
} from "./public-results-allowlist";

/**
 * Public Alexandria result records, one per job, served unauthenticated at
 * GET /v2/alexandria/public/:jobId and rendered by firecrawl-web at
 * firecrawl.dev/artifacts/<jobId>. Only allowlisted capabilities are stored,
 * with allowlisted params and a sanitized payload; nothing here names the team.
 */

export type CreatedVia = "chatgpt" | "claude" | "other";

export type PublicResultRecord = {
  jobId: string;
  provider: string;
  capability: string;
  createdVia: CreatedVia;
  fetchedAt: string;
  params: Record<string, unknown>;
  payload: unknown;
};

const PUBLIC_RESULT_MAX_BYTES = 1024 * 1024;
const PREFIX = "alexandria-public/";

const CHATGPT_ORIGINS = new Set(["mcp-ua-openai-mcp"]);
const CLAUDE_ORIGINS = new Set([
  "mcp-ua-claude-user",
  "mcp-claude-ai",
  "mcp-ua-claude-code",
  "mcp-claude-code",
]);

/**
 * Maps a request origin tag (e.g. `mcp-claude-code@3.24.1`) to the client
 * enum. The raw origin is never stored.
 */
export function createdViaFromOrigin(origin: unknown): CreatedVia {
  if (typeof origin !== "string") return "other";
  const tag = origin.split("@")[0].trim().toLowerCase();
  if (CHATGPT_ORIGINS.has(tag)) return "chatgpt";
  if (CLAUDE_ORIGINS.has(tag)) return "claude";
  return "other";
}

const MAX_STRING_PARAM = 200;
const MAX_LIST_PARAM = 50;

function paramValue(kind: PublicParamKind, value: unknown): unknown {
  switch (kind) {
    case "string":
      return typeof value === "string" &&
        value.length > 0 &&
        value.length <= MAX_STRING_PARAM
        ? value
        : undefined;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined;
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
    case "string[]":
      return Array.isArray(value) &&
        value.length <= MAX_LIST_PARAM &&
        value.every(
          item =>
            typeof item === "string" &&
            item.length > 0 &&
            item.length <= MAX_STRING_PARAM,
        )
        ? value
        : undefined;
  }
}

/** Keeps only the allowlisted options, each with the shape it is listed as. */
export function filterPublicParams(
  allowed: PublicCapability["params"],
  options: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const [name, kind] of Object.entries(allowed)) {
    if (!options || !Object.hasOwn(options, name)) continue;
    const value = paramValue(kind, options[name]);
    if (value !== undefined) params[name] = value;
  }
  return params;
}

// Firecrawl and provider-run internals. Matched exactly, so a provider's own
// sports `team_id` or Polymarket's `negRiskRequestID` stay.
const STRIPPED_KEYS = new Set([
  "$schema",
  "alexandriaId",
  "providerRequestId",
  "workflowRunId",
  "workflow",
  "requestId",
  "request_id",
  "scrapeId",
  "scrape_id",
  "creditsCost",
  "creditsUsed",
  "credits",
  "organizationId",
  "orgId",
  "org_id",
  "teamId",
  "apiKey",
  "api_key",
  "apiKeyId",
  "api_key_id",
  "authorization",
  "cookie",
  "cookies",
  "set-cookie",
  "headers",
]);

const SIGNED_URL_PARAMS =
  /^(x-amz-signature|x-amz-credential|x-amz-security-token|x-goog-signature|x-goog-credential|signature|sig|token|access_token|key-pair-id|policy)$/i;

function isSignedUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value) || !value.includes("?")) return false;
  try {
    for (const name of new URL(value).searchParams.keys())
      if (SIGNED_URL_PARAMS.test(name)) return true;
  } catch {
    return false;
  }
  return false;
}

const MAX_DEPTH = 64;

/**
 * Copies a provider payload without internal fields, signed URLs, or any value
 * equal to one of the caller's identifiers (team, org, key). Returns undefined
 * for a value that must be dropped.
 */
export function sanitizePublicPayload(
  value: unknown,
  secrets: ReadonlySet<string> = new Set(),
  depth = 0,
): unknown {
  if (depth > MAX_DEPTH) return undefined;
  if (typeof value === "string")
    return secrets.has(value) || isSignedUrl(value) ? undefined : value;
  if (Array.isArray(value))
    return value.flatMap(item => {
      const clean = sanitizePublicPayload(item, secrets, depth + 1);
      return clean === undefined ? [] : [clean];
    });
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (STRIPPED_KEYS.has(key)) continue;
      const clean = sanitizePublicPayload(item, secrets, depth + 1);
      if (clean !== undefined) out[key] = clean;
    }
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return undefined;
  return value;
}

function hasTag(payload: unknown, slug: string): boolean {
  const tags = (payload as { tags?: unknown } | null)?.tags;
  return (
    Array.isArray(tags) &&
    tags.some(
      tag =>
        tag === slug ||
        (tag && typeof tag === "object" && (tag as any).slug === slug),
    )
  );
}

type ServedItem = {
  provider?: string;
  capability?: string;
  data?: unknown;
  error?: unknown;
};

/**
 * Picks the job's public record, or explains why there is none. A job gets a
 * record only when exactly one of its items is allowlisted, succeeded, needs
 * no data terms and is not paid-plan-only, so the page is unambiguous.
 */
export function buildPublicRecord(input: {
  jobId: string;
  origin: unknown;
  calls: ProviderCall[];
  results: ServedItem[];
  /** `provider/capability` addresses with no data terms or paid-plan gate. */
  unrestricted: ReadonlySet<string>;
  secrets: ReadonlySet<string>;
  now?: Date;
}):
  | { record: PublicResultRecord }
  | { skipped: "not_eligible" | "ambiguous" | "too_large" } {
  const eligible = input.calls.flatMap((call, i) => {
    const item = input.results[i];
    const address = `${call.provider}/${call.capability}`;
    if (!item || item.error || item.data === undefined) return [];
    if ((item.provider ?? call.provider) !== call.provider) return [];
    if ((item.capability ?? call.capability) !== call.capability) return [];
    if (!input.unrestricted.has(address)) return [];
    const allowed = publicCapability(call.provider, call.capability);
    if (!allowed) return [];
    if (allowed.requiredTag && !hasTag(item.data, allowed.requiredTag))
      return [];
    return [{ call, item, allowed }];
  });
  if (eligible.length === 0) return { skipped: "not_eligible" };
  if (eligible.length > 1) return { skipped: "ambiguous" };
  const [{ call, item, allowed }] = eligible;
  const record: PublicResultRecord = {
    jobId: input.jobId,
    provider: call.provider,
    capability: call.capability,
    createdVia: createdViaFromOrigin(input.origin),
    fetchedAt: (input.now ?? new Date()).toISOString(),
    params: filterPublicParams(allowed.params, call.options),
    payload: sanitizePublicPayload(item.data, input.secrets) ?? null,
  };
  if (Buffer.byteLength(JSON.stringify(record)) > PUBLIC_RESULT_MAX_BYTES)
    return { skipped: "too_large" };
  return { record };
}

const objectName = (jobId: string) => `${PREFIX}${jobId}.json`;

async function savePublicResult(
  record: PublicResultRecord,
): Promise<boolean> {
  if (!config.GCS_BUCKET_NAME) return false;
  await storage
    .bucket(config.GCS_BUCKET_NAME)
    .file(objectName(record.jobId))
    .save(JSON.stringify(record), {
      resumable: false,
      metadata: { contentType: "application/json" },
    });
  return true;
}

export async function loadPublicResult(
  jobId: string,
): Promise<PublicResultRecord | null> {
  if (!config.GCS_BUCKET_NAME) return null;
  try {
    const [content] = await storage
      .bucket(config.GCS_BUCKET_NAME)
      .file(objectName(jobId))
      .download();
    return JSON.parse(content.toString()) as PublicResultRecord;
  } catch (error) {
    if (error instanceof ApiError && error.code === 404) return null;
    throw error;
  }
}

/**
 * Stores the job's public record when it has one. Never throws: a failure is
 * logged and the API response is unaffected.
 */
export async function persistPublicResult(
  input: Parameters<typeof buildPublicRecord>[0],
): Promise<void> {
  const logger = _logger.child({
    module: "alexandria-public-results",
    scrapeId: input.jobId,
  });
  try {
    const built = buildPublicRecord(input);
    if ("skipped" in built) {
      if (built.skipped !== "not_eligible")
        logger.info("Alexandria public result not stored", {
          reason: built.skipped,
        });
      return;
    }
    if (await savePublicResult(built.record))
      logger.debug("Alexandria public result stored", {
        provider: built.record.provider,
        capability: built.record.capability,
      });
  } catch (error) {
    logger.warn("Alexandria public result could not be stored", { error });
  }
}
