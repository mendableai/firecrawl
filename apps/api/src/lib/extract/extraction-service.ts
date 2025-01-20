import fs from "fs";

import {
  Document,
  ExtractRequest,
  toLegacyCrawlerOptions,
  URLTrace,
} from "../../controllers/v1/types";
import { PlanType } from "../../types";
import { logger } from "../logger";
import { processUrl } from "./url-processor";
import { scrapeDocument } from "./document-scraper";
import { generateOpenAICompletions } from "../../scraper/scrapeURL/transformers/llmExtract";
import { buildDocument } from "./build-document";
import { billTeam } from "../../services/billing/credit_billing";
import { logJob } from "../../services/logging/log_job";
import { _addScrapeJobToBullMQ } from "../../services/queue-jobs";
import { saveCrawl, StoredCrawl } from "../crawl-redis";
import { dereferenceSchema } from "./helpers/dereference-schema";
import { z } from "zod";
import OpenAI from "openai";
import { spreadSchemas } from "./helpers/spread-schemas";
import { transformArrayToObject } from "./helpers/transform-array-to-obj";
import { mixSchemaObjects } from "./helpers/mix-schema-objs";
import Ajv from "ajv";
const ajv = new Ajv();

const openai = new OpenAI();
import { updateExtract } from "./extract-redis";
import { deduplicateObjectsArray } from "./helpers/deduplicate-objs-array";
import { mergeNullValObjs } from "./helpers/merge-null-val-objs";
import { CUSTOM_U_TEAMS } from "./config";

interface ExtractServiceOptions {
  request: ExtractRequest;
  teamId: string;
  plan: PlanType;
  subId?: string;
  analyzeScrapeOptions?: AnalyzeScrapeOptions;
}

interface ExtractResult {
  success: boolean;
  data?: any;
  extractId: string;
  warning?: string;
  urlTrace?: URLTrace[];
  error?: string;
}

/**
 * Mode for optionally caching the result:
 *  - "load": Try to load from JSON. If file doesn't exist or fails to parse, run the main logic anyway.
 *  - "save": Run main logic and save the result to JSON.
 *  - "none": Just run main logic with no saving or loading. (default)
 */
export interface AnalyzeScrapeOptions {
  cacheMode?: "save" | "load" | "none";
  cacheKey?: string;
}

type AnalyzeAndScrapeMultiEntityDocsFail = {
  success: false;
  error: string;
  extractId: string;
  urlTrace: URLTrace[];
};

type AnalyzeAndScrapeMultiEntityDocsSuccess = {
  success: true;
  links: string[];
  isMultiEntity: boolean;
  multiEntityKeys: string[];
  reasoning?: string;
  keyIndicators?: string[];
  rSchema: any;
  multiEntitySchema: any;
  multiEntityDocs: Document[];
};

/**
 * Union result for analyzeAndScrapeMultiEntityDocs
 */
export type AnalyzeAndScrapeMultiEntityDocsResult =
  | AnalyzeAndScrapeMultiEntityDocsFail
  | AnalyzeAndScrapeMultiEntityDocsSuccess;

async function analyzeSchemaAndPrompt(
  urls: string[],
  schema: any,
  prompt: string,
): Promise<{
  isMultiEntity: boolean;
  multiEntityKeys: string[];
  reasoning?: string;
  keyIndicators?: string[];
}> {
  const schemaString = JSON.stringify(schema);

  const checkSchema = z.object({
    isMultiEntity: z.boolean(),
    multiEntityKeys: z.array(z.string()),
    reasoning: z.string(),
    keyIndicators: z.array(z.string()),
  });

  const result = await openai.beta.chat.completions.parse({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `
You are a query classifier for a web scraping system. Classify the data extraction query as either:
A) Single-Answer: One answer across a few pages, possibly containing small arrays.
B) Multi-Entity: Many items across many pages, often involving large arrays.

Consider:
1. Answer Cardinality: Single or multiple items?
2. Page Distribution: Found on 1-3 pages or many?
3. Verification Needs: Cross-page verification or independent extraction?

Provide:
- Method: [Single-Answer/Multi-Entity]
- Confidence: [0-100%]
- Reasoning: Why this classification?
- Key Indicators: Specific aspects leading to this decision.

Examples:
- "Is this company a non-profit?" -> Single-Answer
- "Extract all product prices" -> Multi-Entity

For Single-Answer, arrays may be present but are typically small. For Multi-Entity, if arrays have multiple items not from a single page, return keys with large arrays. If nested, return the full key (e.g., 'ecommerce.products').
        `,
      },
      {
        role: "user",
        content: `Classify the query as Single-Answer or Multi-Entity. For Multi-Entity, return keys with large arrays; otherwise, return none:
Schema: ${schemaString}\nPrompt: ${prompt}\nRelevant URLs: ${urls}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        schema: {
          type: "object",
          properties: {
            isMultiEntity: { type: "boolean" },
            multiEntityKeys: { type: "array", items: { type: "string" } },
            reasoning: { type: "string" },
            keyIndicators: { type: "array", items: { type: "string" } },
          },
          required: [
            "isMultiEntity",
            "multiEntityKeys",
            "reasoning",
            "keyIndicators",
          ],
          additionalProperties: false,
        },
        name: "checkSchema",
      },
    },
  });

  const { isMultiEntity, multiEntityKeys, reasoning, keyIndicators } =
    checkSchema.parse(result.choices[0].message.parsed);
  return { isMultiEntity, multiEntityKeys, reasoning, keyIndicators };
}

type completions = {
  extract: Record<string, any>;
  numTokens: number;
  warning?: string;
};

function getRootDomain(url: string): string {
  try {
    if (url.endsWith("/*")) {
      url = url.slice(0, -2);
    }
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}`;
  } catch (e) {
    return url;
  }
}

/**
 * 1) Base function with the main logic ONLY —
 *    no JSON saving/loading is done here.
 */
async function baseAnalyzeAndScrapeMultiEntityDocs(
  request: ExtractRequest,
  teamId: string,
  plan: PlanType,
  extractId: string,
  urlTraces: URLTrace[],
  docsMap: Map<string, Document>,
): Promise<AnalyzeAndScrapeMultiEntityDocsResult> {
  // 1. Gather valid links
  const urlPromises = request.urls.map((url) =>
    processUrl(
      {
        url,
        prompt: request.prompt,
        teamId,
        plan,
        allowExternalLinks: request.allowExternalLinks,
        origin: request.origin,
        limit: request.limit,
        includeSubdomains: request.includeSubdomains,
        schema: request.schema,
      },
      urlTraces,
    ),
  );

  const processedUrls = await Promise.all(urlPromises);
  const links = processedUrls.flat().filter((url) => url);

  if (links.length === 0) {
    return {
      success: false,
      error:
        "No valid URLs found to scrape. Try adjusting your search criteria or including more URLs.",
      extractId,
      urlTrace: urlTraces,
    };
  }

  // 2. Dereference and analyze schema
  const reqSchema = await dereferenceSchema(request.schema);
  const { isMultiEntity, multiEntityKeys, reasoning, keyIndicators } =
    await analyzeSchemaAndPrompt(links, request.schema, request.prompt ?? "");

  let rSchema = reqSchema;
  let multiEntitySchema: any = null;
  let multiEntityDocs: Document[] = [];

  // 3. If multi-entity, gather the relevant docs
  if (isMultiEntity) {
    const { singleAnswerSchema, multiEntitySchema: mSchema } =
      await spreadSchemas(reqSchema, multiEntityKeys);
    rSchema = singleAnswerSchema;
    multiEntitySchema = mSchema;

    const timeout = Math.floor((request.timeout || 40000) * 0.7) || 30000;
    const scrapePromises = links.map((url) => {
      if (!docsMap.has(url)) {
        return scrapeDocument(
          {
            url,
            teamId,
            plan,
            origin: request.origin || "api",
            timeout,
          },
          urlTraces,
        );
      }
      return docsMap.get(url);
    });

    multiEntityDocs = (await Promise.all(scrapePromises)).filter(
      (doc): doc is Document => doc !== null,
    );

    // Update local cache
    for (const doc of multiEntityDocs) {
      if (doc?.metadata?.url) {
        docsMap.set(doc.metadata.url, doc);
      }
    }
  }

  // 4. Return success shape
  return {
    success: true,
    links,
    isMultiEntity,
    multiEntityKeys,
    reasoning,
    keyIndicators,
    rSchema,
    multiEntitySchema,
    multiEntityDocs,
  };
}

/**
 * 2) Public wrapper that uses the base function but optionally
 *    loads or saves results to JSON.
 */
export async function analyzeAndScrapeMultiEntityDocs(
  request: ExtractRequest,
  teamId: string,
  plan: PlanType,
  extractId: string,
  urlTraces: URLTrace[],
  docsMap: Map<string, Document>,
): Promise<AnalyzeAndScrapeMultiEntityDocsResult> {
  const { cacheMode = "none", cacheKey } = request;

  const cacheDir = "./cache";
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir);
  }

  const defaultCachePath = `${cacheDir}/analyze-scrape-${cacheKey}.json`;

  // - If caching is set to "load", try reading a cached JSON first.
  if (cacheMode === "load" && defaultCachePath) {
    try {
      if (fs.existsSync(defaultCachePath)) {
        const fileContents = fs.readFileSync(defaultCachePath, "utf-8");
        const cachedResult: AnalyzeAndScrapeMultiEntityDocsResult =
          JSON.parse(fileContents);
        return cachedResult;
      }
    } catch (err) {
      logger.warn({
        msg: "Could not load JSON from cache: falling back to normal logic.",
        error: err,
      });
      throw err;
    }
  }

  // If loading fails or we're not loading, run the base function
  const result = await baseAnalyzeAndScrapeMultiEntityDocs(
    request,
    teamId,
    plan,
    extractId,
    urlTraces,
    docsMap,
  );

  // - If caching is set to "save", save it to default path
  if (cacheMode === "save" && defaultCachePath) {
    try {
      fs.writeFileSync(
        defaultCachePath,
        JSON.stringify(result, null, 2),
        "utf-8",
      );
    } catch (err) {
      logger.warn({
        msg: "Failed to save JSON to cache file.",
        error: err,
      });
    }
  }

  return result;
}

/**
 * getDocs now also returns the same union type to remain consistent
 */
async function getDocs(
  request: ExtractRequest,
  teamId: string,
  plan: PlanType,
  extractId: string,
  urlTraces: URLTrace[],
  docsMap: Map<string, Document>,
): Promise<AnalyzeAndScrapeMultiEntityDocsResult> {
  const multiEntityResult = await analyzeAndScrapeMultiEntityDocs(
    request,
    teamId,
    plan,
    extractId,
    urlTraces,
    docsMap,
  );

  // If no valid links or other error, short-circuit
  if (!multiEntityResult.success) {
    return multiEntityResult;
  }

  // Otherwise, we pass back the success shape
  return multiEntityResult;
}

/**
 * The main extraction function still returns an ExtractResult,
 * but inside, it uses the narrower union returns from getDocs.
 */
export async function performExtraction(
  extractId: string,
  options: ExtractServiceOptions,
  saveLinks: boolean = false,
  replicateId: string | null = null,
): Promise<ExtractResult> {
  const { request, teamId, plan, subId } = options;
  const urlTraces: URLTrace[] = [];
  const docsMap: Map<string, Document> = new Map();

  // 1) Get docs (with multi-entity diagnostic)
  const getDocsResult = await getDocs(
    request,
    teamId,
    plan,
    extractId,
    urlTraces,
    docsMap,
  );

  // If it failed, short-circuit and shape it to ExtractResult
  if (!getDocsResult.success) {
    return {
      success: false,
      error: getDocsResult.error,
      extractId: getDocsResult.extractId,
      urlTrace: request.urlTrace ? getDocsResult.urlTrace : undefined,
    };
  }

  // Otherwise, destructure the success shape
  const { links, isMultiEntity, rSchema, multiEntitySchema, multiEntityDocs } =
    getDocsResult;

  let singleAnswerResult: any = {};
  let multiEntityResult: any = {};

  if (isMultiEntity) {
    // ...
  }

  // Simple single-entity extraction example:
  if (
    rSchema &&
    rSchema.properties &&
    Object.keys(rSchema.properties).length > 0
  ) {
    const singleAnswerDocs: Document[] = Array.from(docsMap.values());

    const singleAnswerCompletions = await generateOpenAICompletions(
      logger.child({ method: "extractService/generateOpenAICompletions" }),
      {
        mode: "llm",
        systemPrompt:
          (request.systemPrompt ? `${request.systemPrompt}\n` : "") +
          "Always prioritize using the provided content to answer the question. Do not make up an answer. Do not hallucinate. Return 'null' the property you don't find. Be concise and follow the schema if provided. Here are the urls the user provided of which they want to extract information: " +
          links.join(", "),
        prompt: request.prompt,
        schema: rSchema,
      },
      singleAnswerDocs.map((x) => buildDocument(x)).join("\n"),
      undefined,
      true,
    );
    singleAnswerResult = singleAnswerCompletions.extract;
  }

  // Merge single + multi results
  const finalResult = await mixSchemaObjects(
    rSchema,
    singleAnswerResult,
    multiEntityResult,
  );

  // Example billing
  let linksBilled = links.length * 5;
  if (CUSTOM_U_TEAMS.includes(teamId)) {
    linksBilled = 1;
  }
  billTeam(teamId, subId, linksBilled).catch((error) => {
    logger.error(
      `Failed to bill team ${teamId} for ${linksBilled} credits: ${error}`,
    );
  });

  // Logging
  logJob({
    job_id: extractId,
    success: true,
    message: "Extract completed",
    num_docs: docsMap.size,
    docs: finalResult ?? {},
    time_taken: (new Date().getTime() - Date.now()) / 1000,
    team_id: teamId,
    mode: "extract",
    url: request.urls.join(", "),
    scrapeOptions: request,
    origin: request.origin ?? "api",
    num_tokens: 0,
  }).then(() => {
    updateExtract(extractId, {
      status: "completed",
    }).catch((error) => {
      logger.error(
        `Failed to update extract ${extractId} status to completed: ${error}`,
      );
    });
  });

  // Return final
  return {
    success: true,
    data: finalResult ?? {},
    extractId,
    warning: undefined,
    urlTrace: request.urlTrace ? urlTraces : undefined,
  };
}
