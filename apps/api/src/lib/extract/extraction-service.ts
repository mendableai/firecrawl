import {
  Document,
  ExtractRequest,
  TokenUsage,
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
import { billTeam } from "../../services/billing/credit_billing";
import { logJob } from "../../services/logging/log_job";
import { _addScrapeJobToBullMQ } from "../../services/queue-jobs";
import { dereferenceSchema } from "./helpers/dereference-schema";
import { spreadSchemas } from "./helpers/spread-schemas";
import { transformArrayToObject } from "./helpers/transform-array-to-obj";
import { mixSchemaObjects } from "./helpers/mix-schema-objs";
import Ajv from "ajv";
const ajv = new Ajv();

import { ExtractStep, updateExtract } from "./extract-redis";
import { deduplicateObjectsArray } from "./helpers/deduplicate-objs-array";
import { mergeNullValObjs } from "./helpers/merge-null-val-objs";
import { areMergeable } from "./helpers/merge-null-val-objs";
import { CUSTOM_U_TEAMS } from "./config";
import {
  calculateFinalResultCost,
  estimateTotalCost,
} from "./usage/llm-cost";
import { analyzeSchemaAndPrompt } from "./completions/analyzeSchemaAndPrompt";
import { checkShouldExtract } from "./completions/checkShouldExtract";
import { batchExtractPromise } from "./completions/batchExtract";
import { singleAnswerCompletion } from "./completions/singleAnswer";
import { SourceTracker } from "./helpers/source-tracker";
import { getCachedDocs, saveCachedDocs } from "./helpers/cached-docs";
import { normalizeUrl } from "../canonical-url";

interface ExtractServiceOptions {
  request: ExtractRequest;
  teamId: string;
  plan: PlanType;
  subId?: string;
  cacheMode?: "load" | "save" | "direct";
  cacheKey?: string;
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
  sources?: Record<string, string[]>;
}

type completions = {
  extract: Record<string, any>;
  numTokens: number;
  totalUsage: TokenUsage;
  warning?: string;
  sources?: string[];
};


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
  let sources: Record<string, string[]> = {};

  const logger = _logger.child({
    module: "extract",
    method: "performExtraction",
    extractId,
  });

  if (request.__experimental_cacheMode == "load" && request.__experimental_cacheKey) {
    logger.debug("Loading cached docs...");
    try {
      const cache = await getCachedDocs(request.urls, request.__experimental_cacheKey);
      for (const doc of cache) {
        if (doc.metadata.url) {
          docsMap.set(normalizeUrl(doc.metadata.url), doc);
        }
      }
    } catch (error) {
      logger.error("Error loading cached docs", { error });
    }
  }

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
  logger.debug("Processing URLs...", {
    urlCount: request.urls.length,
  });
  
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
      logger.child({ module: "extract", method: "processUrl", url }),
    ),
  );

  const processedUrls = await Promise.all(urlPromises);
  const links = processedUrls.flat().filter((url) => url);
  logger.debug("Processed URLs.", {
    linkCount: links.length,
  });

  if (links.length === 0) {
    logger.error("0 links! Bailing.", {
      linkCount: links.length,
    });
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
    logger.debug("Generated request schema.", {
      originalSchema: request.schema,
      schema: reqSchema,
    });
  }

  if (reqSchema) {
    reqSchema = await dereferenceSchema(reqSchema);
  }

  logger.debug("Transformed schema.", {
    originalSchema: request.schema,
    schema: reqSchema,
  });

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

  logger.debug("Analyzed schema.", {
    isMultiEntity,
    multiEntityKeys,
    reasoning,
    keyIndicators,
  });

  // Track schema analysis tokens
  tokenUsage.push(schemaAnalysisTokenUsage);

  // console.log("\nIs Multi Entity:", isMultiEntity);
  // console.log("\nMulti Entity Keys:", multiEntityKeys);
  // console.log("\nReasoning:", reasoning);
  // console.log("\nKey Indicators:", keyIndicators);

  let rSchema = reqSchema;
  if (isMultiEntity && reqSchema) {
    logger.debug("=== MULTI-ENTITY ===");

    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      reqSchema,
      multiEntityKeys,
    );
    rSchema = singleAnswerSchema;
    logger.debug("Spread schemas.", { singleAnswerSchema, multiEntitySchema });

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

    logger.debug("Starting multi-entity scrape...");
    let startScrape = Date.now();
    
    const scrapePromises = links.map((url) => {
      if (!docsMap.has(normalizeUrl(url))) {
        return scrapeDocument(
          {
            url,
            teamId,
            plan,
            origin: request.origin || "api",
            timeout,
          },
          urlTraces,
          logger.child({
            module: "extract",
            method: "scrapeDocument",
            url,
            isMultiEntity: true,
          }),
          {
            // Needs to be true for multi-entity to work properly
            onlyMainContent: true,
          }
        );
      }
      return docsMap.get(normalizeUrl(url));
    });

    let multyEntityDocs = (await Promise.all(scrapePromises)).filter(
      (doc): doc is Document => doc !== null,
    );

    logger.debug("Multi-entity scrape finished.", {
      docCount: multyEntityDocs.length,
    });

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
        docsMap.set(normalizeUrl(doc.metadata.url), doc);
      }
    }

    logger.debug("Updated docsMap.", { docsMapSize: docsMap.size }); // useful for error probing

    // Process docs in chunks with queue style processing
    const chunkSize = 50;
    const timeoutCompletion = 45000; // 45 second timeout
    const chunks: Document[][] = [];
    const extractionResults: {extract: any, url: string}[] = [];

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

          // Check if page should be extracted before proceeding
          const { extract, tokenUsage: shouldExtractCheckTokenUsage } = await checkShouldExtract(
            request.prompt ?? "",
            multiEntitySchema,
            doc,
          );

          tokenUsage.push(shouldExtractCheckTokenUsage);

          if (!extract) {
            logger.info(
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

          const completionPromise = batchExtractPromise(multiEntitySchema, links, request.prompt ?? "", request.systemPrompt ?? "", doc);

          // Race between timeout and completion
          const multiEntityCompletion = (await Promise.race([
            completionPromise,
            timeoutPromise,
          ])) as Awaited<ReturnType<typeof generateOpenAICompletions>>;

          // Track multi-entity extraction tokens
          if (multiEntityCompletion) {
            tokenUsage.push(multiEntityCompletion.totalUsage);
            
            if (multiEntityCompletion.extract) {
              return {
                extract: multiEntityCompletion.extract,
                url: doc.metadata.url || doc.metadata.sourceURL || ""
              };
            }
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

          return null;
        } catch (error) {
          logger.error(`Failed to process document.`, {
            error,
            url: doc.metadata.url ?? doc.metadata.sourceURL!,
          });
          return null;
        }
      });

      // Wait for current chunk to complete before processing next chunk
      const chunkResults = await Promise.all(chunkPromises);
      const validResults = chunkResults.filter((result): result is {extract: any, url: string} => result !== null);
      extractionResults.push(...validResults);
      multiEntityCompletions.push(...validResults.map(r => r.extract));
      logger.debug("All multi-entity completion chunks finished.", {
        completionCount: multiEntityCompletions.length,
      });
    }

    try {
      // Use SourceTracker to handle source tracking
      const sourceTracker = new SourceTracker();
      
      // Transform and merge results while preserving sources
      sourceTracker.transformResults(extractionResults, multiEntitySchema, false);
      
      multiEntityResult = transformArrayToObject(
        multiEntitySchema,
        multiEntityCompletions,
      );
      
      // Track sources before deduplication
      sourceTracker.trackPreDeduplicationSources(multiEntityResult);
      
      // Apply deduplication and merge
      multiEntityResult = deduplicateObjectsArray(multiEntityResult);
      multiEntityResult = mergeNullValObjs(multiEntityResult);
      
      // Map sources to final deduplicated/merged items
      const multiEntitySources = sourceTracker.mapSourcesToFinalItems(multiEntityResult, multiEntityKeys);
      Object.assign(sources, multiEntitySources);

    } catch (error) {
      logger.error(`Failed to transform array to object`, { error });
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
    logger.debug("=== SINGLE PAGES ===", {
      linkCount: links.length,
      schema: rSchema,
    });

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
      if (!docsMap.has(normalizeUrl(url))) {
        return scrapeDocument(
          {
            url,
            teamId,
            plan,
            origin: request.origin || "api",
            timeout,
          },
          urlTraces,
          logger.child({
            module: "extract",
            method: "scrapeDocument",
            url,
            isMultiEntity: false,
          }),
        );
      }
      return docsMap.get(normalizeUrl(url));
    });

    try {
      const results = await Promise.all(scrapePromises);

      for (const doc of results) {
        if (doc?.metadata?.url) {
          docsMap.set(normalizeUrl(doc.metadata.url), doc);
        }
      }
      logger.debug("Updated docsMap.", { docsMapSize: docsMap.size }); // useful for error probing

      const validResults = results.filter(
        (doc): doc is Document => doc !== null,
      );
      singleAnswerDocs.push(...validResults);
      totalUrlsScraped += validResults.length;

      logger.debug("Scrapes finished.", { docCount: validResults.length });
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
      logger.error("All provided URLs are invalid!");
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
    logger.debug("Generating singleAnswer completions...");
    let { extract: completionResult, tokenUsage: singleAnswerTokenUsage, sources: singleAnswerSources } = await singleAnswerCompletion({
      singleAnswerDocs,
      rSchema,
      links,
      prompt: request.prompt ?? "",
      systemPrompt: request.systemPrompt ?? "",
    });
    logger.debug("Done generating singleAnswer completions.");

    // Track single answer extraction tokens and sources
    if (completionResult) {
      tokenUsage.push(singleAnswerTokenUsage);
      
      // Add sources for top-level properties in single answer
      if (rSchema?.properties) {
        Object.keys(rSchema.properties).forEach(key => {
          if (completionResult[key] !== undefined) {
            sources[key] = singleAnswerSources || singleAnswerDocs.map(doc => doc.metadata.url || doc.metadata.sourceURL || "");
          }
        });
      }
    }

    singleAnswerResult = completionResult;
    singleAnswerCompletions = singleAnswerResult;

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
    ? await mixSchemaObjects(
        reqSchema,
        singleAnswerResult,
        multiEntityResult,
        logger.child({ method: "mixSchemaObjects" }),
      )
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

  // Log job with token usage and sources
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
    sources,
  }).then(() => {
    updateExtract(extractId, {
      status: "completed",
      llmUsage,
      sources,
    }).catch((error) => {
      logger.error(
        `Failed to update extract ${extractId} status to completed: ${error}`,
      );
    });
  });

  logger.debug("Done!");

  if (request.__experimental_cacheMode == "save" && request.__experimental_cacheKey) {
    logger.debug("Saving cached docs...");
    try {
      await saveCachedDocs([...docsMap.values()], request.__experimental_cacheKey);
    } catch (error) {
      logger.error("Error saving cached docs", { error });
    }
  }

  return {
    success: true,
    data: finalResult ?? {},
    extractId,
    warning: undefined,
    urlTrace: request.urlTrace ? urlTraces : undefined,
    llmUsage,
    totalUrlsScraped,
    sources,
  };
}
