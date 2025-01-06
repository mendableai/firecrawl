import { Document, ExtractRequest, URLTrace } from "../../controllers/v1/types";
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
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI();

interface ExtractServiceOptions {
  request: ExtractRequest;
  teamId: string;
  plan: PlanType;
  subId?: string;
}

interface ExtractResult {
  success: boolean;
  data?: any;
  scrapeId: string;
  warning?: string;
  urlTrace?: URLTrace[];
  error?: string;
}

function getRootDomain(url: string): string {
  try {
    if(url.endsWith("/*")) {
      url = url.slice(0, -2);
    }
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}`;
  } catch (e) {
    return url;
  }
}

async function analyzeSchemaAndPrompt(schema: any, prompt: string): Promise<{
  keys: string[],
  hasLargeArrays: boolean
}> {
  const schemaString = JSON.stringify(schema);

  const checkSchema = z.object({
    hasLargeArrays: z.boolean(),
    keys: z.array(z.string())
  });

  const result = await openai.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    messages: [
    {
        role: "system",
        content: "You are a helpful assistant that analyzes a schema and a prompt and determines if the schema or the prompt has an array with a large amount of items. If so, return the keys of the array.",
      },
      {
        role: "user",
        content: `Schema: ${schemaString}\nPrompt: ${prompt}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        schema: {
          type: "object",
          properties: {
            hasLargeArrays: { type: "boolean" },
            keys: { type: "array", items: { type: "string" } }
          },
          required: ["hasLargeArrays", "keys"],
          additionalProperties: false
        },
        name: "checkSchema"
      }
    }
  });

  const { hasLargeArrays, keys } = checkSchema.parse(result.choices[0].message.parsed);
  console.log({ hasLargeArrays, keys });
  return { hasLargeArrays, keys };
}

export async function performExtraction(options: ExtractServiceOptions): Promise<ExtractResult> {
  const { request, teamId, plan, subId } = options;
  const scrapeId = crypto.randomUUID();
  const urlTraces: URLTrace[] = [];
  let docs: Document[] = [];
  let reqSchema = request.schema;

  // agent evaluates if the schema or the prompt has an array with big amount of items
  // also it checks if the schema any other properties that are not arrays
  // if so, it splits the results into 2 types of completions:
  // 1. the first one is a completion that will extract the array of items
  // 2. the second one is multiple completions that will extract the items from the array
  const { hasLargeArrays, keys } = await analyzeSchemaAndPrompt(request.schema, request.prompt ?? "");

  if (hasLargeArrays) {
    // crawl
    console.log("crawl");

    // removes from reqSchema the keys that are arrays
    for (const key of keys) {
      const keyParts = key.split('.');
      let current = reqSchema;
      for (let i = 0; i < keyParts.length - 1; i++) {
        if (current[keyParts[i]]) {
          current = current[keyParts[i]];
        } else {
          current = null;
          break;
        }
      }
      if (current && current[keyParts[keyParts.length - 1]]) {
        delete current[keyParts[keyParts.length - 1]];
      }
    }
    // Perform array extraction
    // const arrayCompletions = await generateArrayCompletions(request, docs);

    // Process arrayCompletions as needed




  } else {
    // map
    console.log("map");

    // Perform item extraction
    // const itemCompletions = await generateItemCompletions(request, docs);
    // Process itemCompletions as needed
  }

  // Process URLs
  const urlPromises = request.urls.map(url => 
    processUrl({
      url,
      prompt: request.prompt,
      teamId,
      plan,
      allowExternalLinks: request.allowExternalLinks,
      origin: request.origin,
      limit: request.limit,
      includeSubdomains: request.includeSubdomains,
    }, urlTraces)
  );

  const processedUrls = await Promise.all(urlPromises);
  const links = processedUrls.flat().filter(url => url);

  if (links.length === 0) {
    return {
      success: false,
      error: "No valid URLs found to scrape. Try adjusting your search criteria or including more URLs.",
      scrapeId,
      urlTrace: urlTraces,
    };
  }

  // Scrape documents
  const timeout = Math.floor((request.timeout || 40000) * 0.7) || 30000;
  const scrapePromises = links.map(url =>
    scrapeDocument({
      url,
      teamId,
      plan,
      origin: request.origin || "api",
      timeout,
    }, urlTraces)
  );

  try {
    const results = await Promise.all(scrapePromises);
    docs.push(...results.filter((doc): doc is Document => doc !== null));
  } catch (error) {
    return {
      success: false,
      error: error.message,
      scrapeId,
      urlTrace: urlTraces,
    };
  }

  // Generate completions
  const completions = await generateOpenAICompletions(
    logger.child({ method: "extractService/generateOpenAICompletions" }),
    {
      mode: "llm",
      systemPrompt:
        (request.systemPrompt ? `${request.systemPrompt}\n` : "") +
        "Always prioritize using the provided content to answer the question. Do not make up an answer. Do not hallucinate. Be concise and follow the schema always if provided. Here are the urls the user provided of which he wants to extract information from: " +
        links.join(", "),
      prompt: request.prompt,
      schema: request.schema,
    },
    docs.map((x) => buildDocument(x)).join("\n"),
    undefined,
    true,
  );

  // Update token usage in traces
  if (completions.numTokens) {
    const totalLength = docs.reduce((sum, doc) => sum + (doc.markdown?.length || 0), 0);
    docs.forEach((doc) => {
      if (doc.metadata?.sourceURL) {
        const trace = urlTraces.find((t) => t.url === doc.metadata.sourceURL);
        if (trace && trace.contentStats) {
          trace.contentStats.tokensUsed = Math.floor(
            ((doc.markdown?.length || 0) / totalLength) * completions.numTokens
          );
        }
      }
    });
  }

  // Kickoff background crawl for indexing root domains
  // const rootDomains = new Set(request.urls.map(getRootDomain));
  // rootDomains.forEach(async url => {
  //   const crawlId = crypto.randomUUID();
    
  //   // Create and save crawl configuration first
  //   const sc: StoredCrawl = {
  //     originUrl: url,
  //     crawlerOptions: {
  //       maxDepth: 15,
  //       limit: 5000,
  //       includePaths: [],
  //       excludePaths: [],
  //       ignoreSitemap: false,
  //       includeSubdomains: true,
  //       allowExternalLinks: false,
  //       allowBackwardLinks: true
  //     },
  //     scrapeOptions: {
  //         formats: ["markdown"],
  //         onlyMainContent: true,
  //         waitFor: 0,
  //         mobile: false,
  //         removeBase64Images: true,
  //         fastMode: false,
  //         parsePDF: true,
  //         skipTlsVerification: false,
  //     },
  //     internalOptions: { 
  //       disableSmartWaitCache: true,
  //       isBackgroundIndex: true
  //     },
  //     team_id: process.env.BACKGROUND_INDEX_TEAM_ID!,
  //     createdAt: Date.now(),
  //     plan: "hobby", // make it a low concurrency
  //   };

  //   // Save the crawl configuration
  //   await saveCrawl(crawlId, sc);

  //   // Then kick off the job
  //   await _addScrapeJobToBullMQ({
  //     url,
  //     mode: "kickoff" as const,
  //     team_id: process.env.BACKGROUND_INDEX_TEAM_ID!,
  //     plan: "hobby", // make it a low concurrency
  //     crawlerOptions: sc.crawlerOptions,
  //     scrapeOptions: sc.scrapeOptions,
  //     internalOptions: sc.internalOptions,
  //     origin: "index",
  //     crawl_id: crawlId,
  //     webhook: null,
  //     v1: true,
  //   }, {}, crypto.randomUUID(), 50);
  // });

  // Bill team for usage
  billTeam(teamId, subId, links.length * 5).catch((error) => {
    logger.error(
      `Failed to bill team ${teamId} for ${links.length * 5} credits: ${error}`,
    );
  });

  // Log job
  logJob({
    job_id: scrapeId,
    success: true,
    message: "Extract completed",
    num_docs: 1,
    docs: completions.extract ?? {},
    time_taken: (new Date().getTime() - Date.now()) / 1000,
    team_id: teamId,
    mode: "extract",
    url: request.urls.join(", "),
    scrapeOptions: request,
    origin: request.origin ?? "api",
    num_tokens: completions.numTokens ?? 0,
  });

  return {
    success: true,
    data: completions.extract ?? {},
    scrapeId,
    warning: completions.warning,
    urlTrace: request.urlTrace ? urlTraces : undefined,
  };
} 