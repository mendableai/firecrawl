import {
  Document,
  ExtractRequest,
  TokenUsage,
  URLTrace,
} from "../../controllers/v1/types";
import { PlanType } from "../../types";
import { logger as _logger, logger } from "../logger";
import { generateBasicCompletion, processUrl } from "./url-processor";
import { scrapeDocument } from "./document-scraper";
import {
  generateCompletions,
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
import { calculateFinalResultCost, estimateTotalCost } from "./usage/llm-cost";
import { analyzeSchemaAndPrompt } from "./completions/analyzeSchemaAndPrompt";
import { checkShouldExtract } from "./completions/checkShouldExtract";
import { batchExtractPromise } from "./completions/batchExtract";
import { singleAnswerCompletion } from "./completions/singleAnswer";
import { SourceTracker } from "./helpers/source-tracker";
import { getCachedDocs, saveCachedDocs } from "./helpers/cached-docs";
import { normalizeUrl } from "../canonical-url";
import { search } from "../../search";
import { buildRephraseToSerpPrompt } from "./build-prompts";

interface ExtractServiceOptions {
  request: ExtractRequest;
  teamId: string;
  plan: PlanType;
  subId?: string;
  cacheMode?: "load" | "save" | "direct";
  cacheKey?: string;
}

export interface ExtractResult {
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
  console.log("Starting extraction process with ID:", extractId);
  console.log("Received options:", JSON.stringify(options, null, 2));

  const { request, teamId, plan, subId } = options;
  const urlTraces: URLTrace[] = [];

  console.log("Initial request URLs:", request.urls);
  console.log("Initial prompt:", request.prompt);

  let docsMap: Map<string, Document> = new Map();
  let singleAnswerCompletions: completions | null = null;
  let multiEntityCompletions: completions[] = [];
  let multiEntityResult: any = {};
  let singleAnswerResult: any = {};
  // let totalUrlsScraped = 0;
  let sources: Record<string, string[]> = {};

  // If no URLs are provided, generate URLs from the prompt
  if ((!request.urls || request.urls.length === 0) && request.prompt) {
    console.log("No URLs provided, generating from prompt...");
    const rephrasedPrompt = await generateBasicCompletion(
      buildRephraseToSerpPrompt(request.prompt),
    );
    console.log("Rephrased prompt:", rephrasedPrompt);

    const searchResults = await search({
      query: rephrasedPrompt.replace('"', "").replace("'", ""),
      num_results: 10,
    });
    console.log("Search results:", searchResults);

    request.urls = searchResults.map((result) => result.url) as string[];
    console.log("Generated URLs:", request.urls);
  }

  if (request.urls && request.urls.length === 0) {
    console.log("No URLs found after search, returning error");
    return {
      success: false,
      error: "No search results found",
      extractId,
    };
  }

  const urls = request.urls || ([] as string[]);

  // // PROB GONNA USE THIS FOR BETTER MAPPING LATER
  // if (request.__experimental_cacheMode == "load" && request.__experimental_cacheKey && urls) {
  //   logger.debug("Loading cached docs...");
  //   try {
  //     const cache = await getCachedDocs(urls, request.__experimental_cacheKey);
  //     for (const doc of cache) {
  //       if (doc.metadata.url) {
  //         docsMap.set(normalizeUrl(doc.metadata.url), doc);
  //       }
  //     }
  //   } catch (error) {
  //     logger.error("Error loading cached docs", { error });
  //   }
  // }

  // Token tracking
  // let tokenUsage: TokenUsage[] = [];

  // await updateExtract(extractId, {
  //   status: "processing",
  //   steps: [
  //     {
  //       step: ExtractStep.INITIAL,
  //       startedAt: Date.now(),
  //       finishedAt: Date.now(),
  //       discoveredLinks: request.urls,
  //     },
  //   ],
  // });
  console.log("Final URLs to process:", urls);

  let startMap = Date.now();
  let aggMapLinks: string[] = [];
  // logger.debug("Processing URLs...", {
  //   urlCount: request.urls?.length || 0,
  // });

  console.log("Starting URL processing...");
  const urlPromises = urls.map((url) =>
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
        console.log(`Discovered new links for ${url}:`, links);
        aggMapLinks.push(...links);
        console.log("Aggregate links count:", aggMapLinks.length);
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
      logger.child({
        module: "extract-reranker-only",
        method: "processUrl",
        url,
      }),
    ),
  );

  console.log("Waiting for all URLs to be processed...");
  const processedUrls = await Promise.all(urlPromises);
  console.log({ processedUrls });

  const links = processedUrls.flat().filter((url) => url);
  // logger.debug("Processed URLs.", {
  //   linkCount: links.length,
  // });
  console.log("Total processed links:", links.length);

  if (links.length === 0) {
    // logger.error("0 links! Bailing.", {
    //   linkCount: links.length,
    // });
    console.log("No valid links found, returning error");

    return {
      success: false,
      error:
        "No valid URLs found to scrape. Try adjusting your search criteria or including more URLs.",
      extractId,
      urlTrace: urlTraces,
      totalUrlsScraped: 0,
    };
  }

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

  const {
    isMultiEntity,
    multiEntityKeys,
    reasoning,
    keyIndicators,
    tokenUsage: schemaAnalysisTokenUsage,
  } = await analyzeSchemaAndPrompt(links, reqSchema, request.prompt ?? "");

  let rSchema = reqSchema;
  if (isMultiEntity && reqSchema) {
    logger.debug("=== MULTI-ENTITY ===");
    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      reqSchema,
      multiEntityKeys,
    );
    rSchema = singleAnswerSchema;
    logger.debug("Spread schemas.", { singleAnswerSchema, multiEntitySchema });

    const timeout = 60000;
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
            module: "extract-reranker-only",
            method: "scrapeDocument",
            url,
            isMultiEntity: true,
          }),
          {
            ...request.scrapeOptions,

            // Needs to be true for multi-entity to work properly
            onlyMainContent: true,
          },
        );
      }
      return docsMap.get(normalizeUrl(url));
    });

    let multyEntityDocs = (await Promise.all(scrapePromises)).filter(
      (doc): doc is Document => doc !== null,
    );

    console.log({ multyEntityDocs });

    logger.debug("Updated docsMap.", { docsMapSize: docsMap.size }); // useful for error probing

    // Process docs in chunks with queue style processing
    const chunkSize = 50;
    const timeoutCompletion = 45000; // 45 second timeout
    const chunks: Document[][] = [];
    const extractionResults: { extract: any; url: string }[] = [];

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
          const { extract, tokenUsage: shouldExtractCheckTokenUsage } =
            await checkShouldExtract(
              request.prompt ?? "",
              multiEntitySchema,
              doc,
            );

          // tokenUsage.push(shouldExtractCheckTokenUsage);

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

          // const completionPromise = batchExtractPromise(
          //   multiEntitySchema,
          //   links,
          //   request.prompt ?? "",
          //   request.systemPrompt ?? "",
          //   doc,
          // );

          // Race between timeout and completion
          // const multiEntityCompletion = (await Promise.race([
          //   completionPromise,
          //   timeoutPromise,
          // ])) as Awaited<ReturnType<typeof generateCompletions>>;

          // Track multi-entity extraction tokens
          // if (multiEntityCompletion) {
          //   // tokenUsage.push(multiEntityCompletion.totalUsage);

          //   if (multiEntityCompletion.extract) {
          //     return {
          //       extract: multiEntityCompletion.extract,
          //       url: doc.metadata.url || doc.metadata.sourceURL || "",
          //     };
          //   }
          // }

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
      // const validResults = chunkResults.filter(
      //   (result): result is { extract: any; url: string } => result !== null,
      // );
      // extractionResults.push(...validResults);
      // multiEntityCompletions.push(...validResults.map((r) => r.extract));
      // logger.debug("All multi-entity completion chunks finished.", {
      //   completionCount: multiEntityCompletions.length,
      // });
    }

    // try {
    //   // Use SourceTracker to handle source tracking
    //   const sourceTracker = new SourceTracker();

    //   // Transform and merge results while preserving sources
    //   sourceTracker.transformResults(
    //     extractionResults,
    //     multiEntitySchema,
    //     false,
    //   );

    //   multiEntityResult = transformArrayToObject(
    //     multiEntitySchema,
    //     multiEntityCompletions,
    //   );

    //   // Track sources before deduplication
    //   sourceTracker.trackPreDeduplicationSources(multiEntityResult);

    //   // Apply deduplication and merge
    //   multiEntityResult = deduplicateObjectsArray(multiEntityResult);
    //   multiEntityResult = mergeNullValObjs(multiEntityResult);

    //   // Map sources to final deduplicated/merged items
    //   const multiEntitySources = sourceTracker.mapSourcesToFinalItems(
    //     multiEntityResult,
    //     multiEntityKeys,
    //   );
    //   Object.assign(sources, multiEntitySources);
    // } catch (error) {
    //   logger.error(`Failed to transform array to object`, { error });
    //   return {
    //     success: false,
    //     error:
    //       "An unexpected error occurred. Please contact help@firecrawl.com for help.",
    //     extractId,
    //     urlTrace: urlTraces,
    //     totalUrlsScraped: 0,
    //   };
    // }
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

    // const scrapePromises = links.map((url) => {
    //   if (!docsMap.has(normalizeUrl(url))) {
    //     return scrapeDocument(
    //       {
    //         url,
    //         teamId,
    //         plan,
    //         origin: request.origin || "api",
    //         timeout,
    //       },
    //       urlTraces,
    //       logger.child({
    //         module: "extract",
    //         method: "scrapeDocument",
    //         url,
    //         isMultiEntity: false,
    //       }),
    //       request.scrapeOptions
    //     );
    //   }
    //   return docsMap.get(normalizeUrl(url));
    // });

    // try {
    //   const results = await Promise.all(scrapePromises);

    //   for (const doc of results) {
    //     if (doc?.metadata?.url) {
    //       docsMap.set(normalizeUrl(doc.metadata.url), doc);
    //     }
    //   }
    //   logger.debug("Updated docsMap.", { docsMapSize: docsMap.size }); // useful for error probing

    //   const validResults = results.filter(
    //     (doc): doc is Document => doc !== null,
    //   );
    //   singleAnswerDocs.push(...validResults);
    //   totalUrlsScraped += validResults.length;

    //   logger.debug("Scrapes finished.", { docCount: validResults.length });
    // } catch (error) {
    //   return {
    //     success: false,
    //     error: error.message,
    //     extractId,
    //     urlTrace: urlTraces,
    //     totalUrlsScraped: 0,
    //   };
    // }

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
      // tokenUsage.push(singleAnswerTokenUsage);
      
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

  console.log("Extraction completed successfully");
  return {
    success: true,
    data: { urls: links.map((url) => { return { url } }) },
    extractId,
    warning: undefined,
    urlTrace: request.urlTrace ? urlTraces : undefined,
    llmUsage: 0,
    totalUrlsScraped: 0,
    sources: {},
  };
}