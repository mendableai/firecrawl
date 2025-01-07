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
  extractId: string;
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

async function analyzeSchemaAndPrompt(numUrls: number, schema: any, prompt: string): Promise<{
  keysWithLargeArrays: string[],
  hasLargeArrays: boolean
}> {
  const schemaString = JSON.stringify(schema);

  const checkSchema = z.object({
    hasLargeArrays: z.boolean(),
    keysWithLargeArrays: z.array(z.string())
  });

  const result = await openai.beta.chat.completions.parse({
    model: "gpt-4o-mini",
    messages: [
    {
        role: "system",
        content: "\
          You are a helpful assistant that analyzes a schema, a prompt, and the number of urls and determines if the schema or the prompt has an array with a large amount of items.\
          If the array with large amount of items is deep nested, you should return the whole key. For example, if the key is 'products' below 'ecommerce', you should return 'ecommerce.products'.\
        ",
      },
      {
        role: "user",
        content: `Schema: ${schemaString}\nPrompt: ${prompt}\nnumber of urls: ${numUrls}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        schema: {
          type: "object",
          properties: {
            hasLargeArrays: { type: "boolean" },
            keysWithLargeArrays: { type: "array", items: { type: "string" } }
          },
          required: ["hasLargeArrays", "keysWithLargeArrays"],
          additionalProperties: false
        },
        name: "checkSchema"
      }
    }
  });

  const { hasLargeArrays, keysWithLargeArrays } = checkSchema.parse(result.choices[0].message.parsed);
  console.log({ hasLargeArrays, keysWithLargeArrays });
  return { hasLargeArrays, keysWithLargeArrays };
}

export async function performExtraction(extractId: string, options: ExtractServiceOptions): Promise<ExtractResult> {
  const { request, teamId, plan, subId } = options;
  const urlTraces: URLTrace[] = [];
  let docs: Document[] = [];
  let completions: {
    extract: any;
    numTokens: number;
    warning: string | undefined;
  } | null = null;
  let largeArrayResult: any = {};
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
      extractId,
      urlTrace: urlTraces,
    };
  }

  let reqSchema = request.schema;

  // agent evaluates if the schema or the prompt has an array with big amount of items
  // also it checks if the schema any other properties that are not arrays
  // if so, it splits the results into 2 types of completions:
  // 1. the first one is a completion that will extract the array of items
  // 2. the second one is multiple completions that will extract the items from the array
  const { hasLargeArrays, keysWithLargeArrays } = await analyzeSchemaAndPrompt(links.length, request.schema, request.prompt ?? "");
  console.log({ hasLargeArrays, keysWithLargeArrays });
  if (hasLargeArrays) {
    // removes from reqSchema the keys that are large arrays
    for (const key of keysWithLargeArrays) {
      const keyParts = key.split('.');
      let currentSchema = reqSchema['properties'];
      for (let i = 0; i < keyParts.length - 1; i++) {
        currentSchema = currentSchema[keyParts[i]]['properties'];
      }
      delete currentSchema[keyParts[keyParts.length - 1]];
    }
    
    // recursively delete keys with 'properties' == {}
    const deleteEmptyProperties = (schema: any) => {
      for (const key in schema['properties']) {
        if (
          schema['properties'][key]['properties'] &&
          Object.keys(schema['properties'][key]['properties']).length === 0
        ) {
          delete schema['properties'][key];
        } else if (schema['properties'][key]['properties']) {
          deleteEmptyProperties(schema['properties'][key]);
        }
      }
    }
    
    deleteEmptyProperties(reqSchema);

    // crawl
    // Create and save crawl configuration first
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

    for (const key of keysWithLargeArrays) {
      // batch scrape    



      // merge the results into the 
      const keys = key.split('.');
      let currentLevel = largeArrayResult;

      // Traverse or create nested objects based on the keys
      for (let i = 0; i < keys.length; i++) {
        const part = keys[i];
        if (i === keys.length - 1) {
          // Assign the array to the last key
          currentLevel[part] = ["a", "b", "c"]; // TODO: replace with actual results
        } else {
          // Create the object if it doesn't exist
          if (!currentLevel[part]) {
            currentLevel[part] = {};
          }
          currentLevel = currentLevel[part];
        }
      }
      
    }

  }
  
  if (reqSchema && Object.keys(reqSchema).length > 0) {

    // Perform item extraction
    // const itemCompletions = await generateItemCompletions(request, docs);
    // Process itemCompletions as needed

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
        extractId,
        urlTrace: urlTraces,
      };
    }

    // Generate completions
    completions = await generateOpenAICompletions(
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
    if (completions && completions.numTokens) {
      const totalLength = docs.reduce((sum, doc) => sum + (doc.markdown?.length || 0), 0);
      docs.forEach((doc) => {
        if (doc.metadata?.sourceURL) {
          const trace = urlTraces.find((t) => t.url === doc.metadata.sourceURL);
          if (trace && trace.contentStats) {
            trace.contentStats.tokensUsed = Math.floor(
              ((doc.markdown?.length || 0) / totalLength) * (completions?.numTokens || 0)
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
  }

  if (completions && completions.extract) {
    for (const key in largeArrayResult) {
      completions.extract[key] = largeArrayResult[key];
    }
  }

  // Bill team for usage
  billTeam(teamId, subId, links.length * 5).catch((error) => {
    logger.error(
      `Failed to bill team ${teamId} for ${links.length * 5} credits: ${error}`,
    );
  });

  // Log job
  logJob({
    job_id: extractId,
    success: true,
    message: "Extract completed",
    num_docs: 1,
    docs: completions?.extract ?? {},
    time_taken: (new Date().getTime() - Date.now()) / 1000,
    team_id: teamId,
    mode: "extract",
    url: request.urls.join(", "),
    scrapeOptions: request,
    origin: request.origin ?? "api",
    num_tokens: completions?.numTokens ?? 0,
  });

  return {
    success: true,
    data: completions?.extract ?? {},
    extractId,
    warning: completions?.warning,
    urlTrace: request.urlTrace ? urlTraces : undefined,
  };
} 