import {
  Document,
  ExtractRequest,
  TokenUsage,
  toLegacyCrawlerOptions,
  URLTrace,
} from "../../controllers/v1/types";
import { PlanType } from "../../types";
import { logger as _logger } from "../logger";
import { processUrl } from "./url-processor";
import { scrapeDocument } from "./document-scraper";
import {
  generateOpenAICompletions,
  generateSchemaFromPrompt,
} from "../../scraper/scrapeURL/transformers/llmExtract";
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
import { ExtractStep, updateExtract } from "./extract-redis";
import { deduplicateObjectsArray } from "./helpers/deduplicate-objs-array";
import { mergeNullValObjs } from "./helpers/merge-null-val-objs";
import { CUSTOM_U_TEAMS, extractConfig } from "./config";
import {
  calculateFinalResultCost,
  estimateCost,
  estimateTotalCost,
} from "./usage/llm-cost";
import { numTokensFromString } from "../LLM-extraction/helpers";

interface ExtractServiceOptions {
  request: ExtractRequest;
  teamId: string;
  plan: PlanType;
  subId?: string;
}

interface ExtractResult {
  success: boolean;
  data?: any;
  extractId: string;
  warning?: string;
  urlTrace?: URLTrace[];
  error?: string;
  tokenUsageBreakdown?: TokenUsage[];
  llmUsage?: number;
  totalUrlsScraped?: number;
}

async function analyzeSchemaAndPrompt(
  urls: string[],
  schema: any,
  prompt: string,
): Promise<{
  isMultiEntity: boolean;
  multiEntityKeys: string[];
  reasoning?: string;
  keyIndicators?: string[];
  tokenUsage: TokenUsage;
}> {
  if (!schema) {
    schema = await generateSchemaFromPrompt(prompt);
  }

  const schemaString = JSON.stringify(schema);

  const checkSchema = z.object({
    isMultiEntity: z.boolean(),
    multiEntityKeys: z.array(z.string()),
    reasoning: z.string(),
    keyIndicators: z.array(z.string()),
  });

  const model = "gpt-4o";

  const result = await openai.beta.chat.completions.parse({
    model: model,
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

  const tokenUsage: TokenUsage = {
    promptTokens: result.usage?.prompt_tokens ?? 0,
    completionTokens: result.usage?.completion_tokens ?? 0,
    totalTokens: result.usage?.total_tokens ?? 0,
    model: model,
  };
  return {
    isMultiEntity,
    multiEntityKeys,
    reasoning,
    keyIndicators,
    tokenUsage,
  };
}

type completions = {
  extract: Record<string, any>;
  numTokens: number;
  totalUsage: TokenUsage;
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

export async function performExtraction(
  extractId: string,
  options: ExtractServiceOptions,
): Promise<ExtractResult> {
  const { request, teamId, plan, subId } = options;
  const urlTraces: URLTrace[] = [];
  let docsMap: Map<string, Document> = new Map();
  let singleAnswerCompletions: completions | null = null;
  let multiEntityCompletions: completions[] = [];
  let multiEntityResult: any = {};
  let singleAnswerResult: any = {};
  let totalUrlsScraped = 0;

  const logger = _logger.child({
    module: "extraction-service",
    method: "performExtraction",
    extractId,
  });

  // Token tracking
  let tokenUsage: TokenUsage[] = [];

  await updateExtract(extractId, {
    status: "processing",
    steps: [
      {
        step: ExtractStep.INITIAL,
        startedAt: Date.now(),
        finishedAt: Date.now(),
        discoveredLinks: request.urls,
      },
    ],
  });

  let startMap = Date.now();
  let aggMapLinks: string[] = [];
  // Process URLs
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
      (links: string[]) => {
        aggMapLinks.push(...links);
        updateExtract(extractId, {
          steps: [
            {
              step: ExtractStep.MAP,
              startedAt: startMap,
              finishedAt: Date.now(),
              discoveredLinks: aggMapLinks,
            },
          ],
        });
      },
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
      totalUrlsScraped: 0,
    };
  }

  await updateExtract(extractId, {
    status: "processing",
    steps: [
      {
        step: ExtractStep.MAP_RERANK,
        startedAt: startMap,
        finishedAt: Date.now(),
        discoveredLinks: links,
      },
    ],
  });

  let reqSchema = request.schema;
  if (!reqSchema && request.prompt) {
    reqSchema = await generateSchemaFromPrompt(request.prompt);
  }

  if (reqSchema) {
    reqSchema = await dereferenceSchema(reqSchema);
  }

  // agent evaluates if the schema or the prompt has an array with big amount of items
  // also it checks if the schema any other properties that are not arrays
  // if so, it splits the results into 2 types of completions:
  // 1. the first one is a completion that will extract the array of items
  // 2. the second one is multiple completions that will extract the items from the array
  let startAnalyze = Date.now();
  const {
    isMultiEntity,
    multiEntityKeys,
    reasoning,
    keyIndicators,
    tokenUsage: schemaAnalysisTokenUsage,
  } = await analyzeSchemaAndPrompt(links, reqSchema, request.prompt ?? "");

  // Track schema analysis tokens
  tokenUsage.push(schemaAnalysisTokenUsage);

  // console.log("\nIs Multi Entity:", isMultiEntity);
  // console.log("\nMulti Entity Keys:", multiEntityKeys);
  // console.log("\nReasoning:", reasoning);
  // console.log("\nKey Indicators:", keyIndicators);

  let rSchema = reqSchema;
  if (isMultiEntity && reqSchema) {
    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      reqSchema,
      multiEntityKeys,
    );
    rSchema = singleAnswerSchema;

    await updateExtract(extractId, {
      status: "processing",
      steps: [
        {
          step: ExtractStep.MULTI_ENTITY,
          startedAt: startAnalyze,
          finishedAt: Date.now(),
          discoveredLinks: [],
        },
      ],
    });

    const timeout = 60000;

    await updateExtract(extractId, {
      status: "processing",
      steps: [
        {
          step: ExtractStep.MULTI_ENTITY_SCRAPE,
          startedAt: startAnalyze,
          finishedAt: Date.now(),
          discoveredLinks: links,
        },
      ],
    });

    let startScrape = Date.now();
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

    let multyEntityDocs = (await Promise.all(scrapePromises)).filter(
      (doc): doc is Document => doc !== null,
    );

    totalUrlsScraped += multyEntityDocs.length;

    let endScrape = Date.now();

    await updateExtract(extractId, {
      status: "processing",
      steps: [
        {
          step: ExtractStep.MULTI_ENTITY_SCRAPE,
          startedAt: startScrape,
          finishedAt: endScrape,
          discoveredLinks: links,
        },
      ],
    });

    for (const doc of multyEntityDocs) {
      if (doc?.metadata?.url) {
        docsMap.set(doc.metadata.url, doc);
      }
    }

    // Process docs in chunks with queue style processing
    const chunkSize = 50;
    const timeoutCompletion = 45000; // 45 second timeout
    const chunks: Document[][] = [];

    // Split into chunks
    for (let i = 0; i < multyEntityDocs.length; i += chunkSize) {
      chunks.push(multyEntityDocs.slice(i, i + chunkSize));
    }

    // Process chunks sequentially with timeout
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (doc) => {
        try {
          ajv.compile(multiEntitySchema);

          // Wrap in timeout promise
          const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve(null), timeoutCompletion);
          });

          // // Check if page should be extracted before proceeding
          const shouldExtractCheck = await generateOpenAICompletions(
            logger.child({ method: "extractService/checkShouldExtract" }),
            {
              mode: "llm",
              systemPrompt:
                "You are a content relevance checker. Your job is to determine if the provided content is very relevant to extract information from based on the user's prompt. Return true only if the content appears relevant and contains information that could help answer the prompt. Return false if the content seems irrelevant or unlikely to contain useful information for the prompt.",
              prompt: `Should the following content be used to extract information for this prompt: "${request.prompt}" User schema is: ${JSON.stringify(multiEntitySchema)}\nReturn only true or false.`,
              schema: {
                type: "object",
                properties: {
                  extract: {
                    type: "boolean",
                  },
                },
                required: ["extract"],
              },
            },
            buildDocument(doc),
            undefined,
            true,
          );

          tokenUsage.push(shouldExtractCheck.totalUsage);

          if (!shouldExtractCheck.extract["extract"]) {
            console.log(
              `Skipping extraction for ${doc.metadata.url} as content is irrelevant`,
            );
            return null;
          }
          // Add confidence score to schema with 5 levels
          const schemaWithConfidence = {
            ...multiEntitySchema,
            properties: {
              ...multiEntitySchema.properties,
              is_content_relevant: {
                type: "boolean",
                description:
                  "Determine if this content is relevant to the prompt. Return true ONLY if the content contains information that directly helps answer the prompt. Return false if the content is irrelevant or unlikely to contain useful information.",
              },
            },
            required: [
              ...(multiEntitySchema.required || []),
              "is_content_relevant",
            ],
          };
          // console.log("schemaWithConfidence", schemaWithConfidence);

          await updateExtract(extractId, {
            status: "processing",
            steps: [
              {
                step: ExtractStep.MULTI_ENTITY_EXTRACT,
                startedAt: startScrape,
                finishedAt: Date.now(),
                discoveredLinks: [
                  doc.metadata.url || doc.metadata.sourceURL || "",
                ],
              },
            ],
          });

          const completionPromise = generateOpenAICompletions(
            logger.child({
              method: "extractService/generateOpenAICompletions",
            }),
            {
              mode: "llm",
              systemPrompt:
                (request.systemPrompt ? `${request.systemPrompt}\n` : "") +
                `Always prioritize using the provided content to answer the question. Do not make up an answer. Do not hallucinate. Be concise and follow the schema always if provided. If the document provided is not relevant to the prompt nor to the final user schema ${JSON.stringify(multiEntitySchema)}, return null. Here are the urls the user provided of which he wants to extract information from: ` +
                links.join(", "),
              prompt: request.prompt,
              schema: multiEntitySchema,
            },
            buildDocument(doc),
            undefined,
            true,
          );

          // Race between timeout and completion
          const multiEntityCompletion = (await Promise.race([
            completionPromise,
            timeoutPromise,
          ])) as Awaited<ReturnType<typeof generateOpenAICompletions>>;

          // Track multi-entity extraction tokens
          if (multiEntityCompletion) {
            tokenUsage.push(multiEntityCompletion.totalUsage);
          }

          // console.log(multiEntityCompletion.extract)
          // if (!multiEntityCompletion.extract?.is_content_relevant) {
          //   console.log(`Skipping extraction for ${doc.metadata.url} as content is not relevant`);
          //   return null;
          // }

          // Update token usage in traces
          // if (multiEntityCompletion && multiEntityCompletion.numTokens) {
          //   const totalLength = docs.reduce(
          //     (sum, doc) => sum + (doc.markdown?.length || 0),
          //     0,
          //   );
          //   docs.forEach((doc) => {
          //     if (doc.metadata?.sourceURL) {
          //       const trace = urlTraces.find(
          //         (t) => t.url === doc.metadata.sourceURL,
          //       );
          //       if (trace && trace.contentStats) {
          //         trace.contentStats.tokensUsed = Math.floor(
          //           ((doc.markdown?.length || 0) / totalLength) *
          //             (multiEntityCompletion?.numTokens || 0),
          //         );
          //       }
          //     }
          //   });
          //  }

          // if (multiEntityCompletion.extract && multiEntityCompletion.extract.extraction_confidence < 3) {
          //   console.log(`Skipping extraction for ${doc.metadata.url} as confidence is too low (${multiEntityCompletion.extract.extraction_confidence})`);
          //   return null;
          // }

          return multiEntityCompletion.extract;
        } catch (error) {
          logger.error(`Failed to process document: ${error}`);
          return null;
        }
      });

      // Wait for current chunk to complete before processing next chunk
      const chunkResults = await Promise.all(chunkPromises);
      multiEntityCompletions.push(
        ...chunkResults.filter((result) => result !== null),
      );
    }

    try {
      multiEntityResult = transformArrayToObject(
        multiEntitySchema,
        multiEntityCompletions,
      );
      multiEntityResult = deduplicateObjectsArray(multiEntityResult);
      multiEntityResult = mergeNullValObjs(multiEntityResult);
      // @nick: maybe we can add here a llm that checks if the array probably has a primary key?
    } catch (error) {
      logger.error(`Failed to transform array to object: ${error}`);
      return {
        success: false,
        error:
          "An unexpected error occurred. Please contact help@firecrawl.com for help.",
        extractId,
        urlTrace: urlTraces,
        totalUrlsScraped,
      };
    }
  }
  if (
    rSchema &&
    Object.keys(rSchema).length > 0 &&
    rSchema.properties &&
    Object.keys(rSchema.properties).length > 0
  ) {
    // Scrape documents
    const timeout = 60000;
    let singleAnswerDocs: Document[] = [];

    // let rerank = await rerankLinks(links.map((url) => ({ url })), request.prompt ?? JSON.stringify(request.schema), urlTraces);

    await updateExtract(extractId, {
      status: "processing",
      steps: [
        {
          step: ExtractStep.SCRAPE,
          startedAt: Date.now(),
          finishedAt: Date.now(),
          discoveredLinks: links,
        },
      ],
    });
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

    try {
      const results = await Promise.all(scrapePromises);

      for (const doc of results) {
        if (doc?.metadata?.url) {
          docsMap.set(doc.metadata.url, doc);
        }
      }

      const validResults = results.filter(
        (doc): doc is Document => doc !== null,
      );
      singleAnswerDocs.push(...validResults);
      totalUrlsScraped += validResults.length;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        extractId,
        urlTrace: urlTraces,
        totalUrlsScraped,
      };
    }

    if (docsMap.size == 0) {
      // All urls are invalid
      return {
        success: false,
        error:
          "All provided URLs are invalid. Please check your input and try again.",
        extractId,
        urlTrace: request.urlTrace ? urlTraces : undefined,
        totalUrlsScraped: 0,
      };
    }

    await updateExtract(extractId, {
      status: "processing",
      steps: [
        {
          step: ExtractStep.EXTRACT,
          startedAt: Date.now(),
          finishedAt: Date.now(),
          discoveredLinks: links,
        },
      ],
    });

    // Generate completions
    singleAnswerCompletions = await generateOpenAICompletions(
      logger.child({ method: "extractService/generateOpenAICompletions" }),
      {
        mode: "llm",
        systemPrompt:
          (request.systemPrompt ? `${request.systemPrompt}\n` : "") +
          "Always prioritize using the provided content to answer the question. Do not make up an answer. Do not hallucinate. Return 'null' the property that you don't find the information. Be concise and follow the schema always if provided. Here are the urls the user provided of which he wants to extract information from: " +
          links.join(", "),
        prompt: request.prompt,
        schema: rSchema,
      },
      singleAnswerDocs.map((x) => buildDocument(x)).join("\n"),
      undefined,
      true,
    );

    // Track single answer extraction tokens
    if (singleAnswerCompletions) {
      tokenUsage.push(singleAnswerCompletions.totalUsage);
    }

    singleAnswerResult = singleAnswerCompletions.extract;

    // Update token usage in traces
    // if (completions && completions.numTokens) {
    //   const totalLength = docs.reduce(
    //     (sum, doc) => sum + (doc.markdown?.length || 0),
    //     0,
    //   );
    //   docs.forEach((doc) => {
    //     if (doc.metadata?.sourceURL) {
    //       const trace = urlTraces.find((t) => t.url === doc.metadata.sourceURL);
    //       if (trace && trace.contentStats) {
    //         trace.contentStats.tokensUsed = Math.floor(
    //           ((doc.markdown?.length || 0) / totalLength) *
    //             (completions?.numTokens || 0),
    //         );
    //       }
    //     }
    //   });
    // }
  }

  let finalResult = reqSchema
    ? await mixSchemaObjects(reqSchema, singleAnswerResult, multiEntityResult)
    : singleAnswerResult || multiEntityResult;

  // Tokenize final result to get token count
  // let finalResultTokens = 0;
  // if (finalResult) {
  //   const finalResultStr = JSON.stringify(finalResult);
  //   finalResultTokens = numTokensFromString(finalResultStr, "gpt-4o");

  // }
  // // Deduplicate and validate final result against schema
  // if (reqSchema && finalResult && finalResult.length <= extractConfig.DEDUPLICATION.MAX_TOKENS) {
  //   const schemaValidation = await generateOpenAICompletions(
  //     logger.child({ method: "extractService/validateAndDeduplicate" }),
  //     {
  //       mode: "llm",
  //       systemPrompt: `You are a data validator and deduplicator. Your task is to:
  //       1. Remove any duplicate entries in the data extracted by merging that into a single object according to the provided shcema
  //       2. Ensure all data matches the provided schema
  //       3. Keep only the highest quality and most complete entries when duplicates are found.

  //       Do not change anything else. If data is null keep it null. If the schema is not provided, return the data as is.`,
  //       prompt: `Please validate and merge the duplicate entries in this data according to the schema provided:\n

  //       <start of extract data>

  //       ${JSON.stringify(finalResult)}

  //       <end of extract data>

  //       <start of schema>

  //       ${JSON.stringify(reqSchema)}

  //       <end of schema>
  //       `,
  //       schema: reqSchema,
  //     },
  //     undefined,
  //     undefined,
  //     true,
  //     "gpt-4o"
  //   );
  //   console.log("schemaValidation", schemaValidation);

  //   console.log("schemaValidation", finalResult);

  //   if (schemaValidation?.extract) {
  //     tokenUsage.push(schemaValidation.totalUsage);
  //     finalResult = schemaValidation.extract;
  //   }
  // }

  const totalTokensUsed = tokenUsage.reduce((a, b) => a + b.totalTokens, 0);
  const llmUsage = estimateTotalCost(tokenUsage);
  let tokensToBill = calculateFinalResultCost(finalResult);

  if (CUSTOM_U_TEAMS.includes(teamId)) {
    tokensToBill = 1;
  }

  // Bill team for usage
  billTeam(teamId, subId, tokensToBill, logger, true).catch((error) => {
    logger.error(
      `Failed to bill team ${teamId} for ${tokensToBill} tokens: ${error}`,
    );
  });

  // Log job with token usage
  logJob({
    job_id: extractId,
    success: true,
    message: "Extract completed",
    num_docs: 1,
    docs: finalResult ?? {},
    time_taken: (new Date().getTime() - Date.now()) / 1000,
    team_id: teamId,
    mode: "extract",
    url: request.urls.join(", "),
    scrapeOptions: request,
    origin: request.origin ?? "api",
    num_tokens: totalTokensUsed,
    tokens_billed: tokensToBill,
  }).then(() => {
    updateExtract(extractId, {
      status: "completed",
      llmUsage,
    }).catch((error) => {
      logger.error(
        `Failed to update extract ${extractId} status to completed: ${error}`,
      );
    });
  });

  return {
    success: true,
    data: finalResult ?? {},
    extractId,
    warning: undefined, // TODO FIX
    urlTrace: request.urlTrace ? urlTraces : undefined,
    llmUsage,
    totalUrlsScraped,
  };
}
