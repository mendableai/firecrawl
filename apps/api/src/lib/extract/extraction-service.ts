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
import { dereference } from "@apidevtools/json-schema-ref-parser";
import { z } from "zod";
import isEqual from 'lodash/isEqual';
import OpenAI from "openai";

import Ajv from "ajv";
const ajv = new Ajv();

const openai = new OpenAI();
import { updateExtract } from "./extract-redis";

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

async function dereferenceSchema(schema: any): Promise<any> {
  try {
    return await dereference(schema);
  } catch (error) {
    console.error("Failed to dereference schema:", error);
    throw error;
  }
}

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

export async function spreadSchemas(schema: any, keys: string[]): Promise<{
  singleAnswerSchema: any;
  multiEntitySchema: any;
}> {
  let singleAnswerSchema = { ...schema, properties: { ...schema.properties } };
  let multiEntitySchema: any = { type: "object", properties: {} };

  keys.forEach((key) => {
    if (singleAnswerSchema.properties[key]) {
      multiEntitySchema.properties[key] = singleAnswerSchema.properties[key];
      delete singleAnswerSchema.properties[key];
    }
  });
  // Recursively delete empty properties in singleAnswerSchema
  const deleteEmptyProperties = (schema: any) => {
    for (const key in schema.properties) {
      if (
        schema.properties[key].properties &&
        Object.keys(schema.properties[key].properties).length === 0
      ) {
        delete schema.properties[key];
      } else if (schema.properties[key].properties) {
        deleteEmptyProperties(schema.properties[key]);
      }
    }
  };

  deleteEmptyProperties(singleAnswerSchema);
  deleteEmptyProperties(multiEntitySchema);

  // If singleAnswerSchema has no properties left, return an empty object
  if (Object.keys(singleAnswerSchema.properties).length === 0) {
    singleAnswerSchema = {};
  }
   
  if (Object.keys(multiEntitySchema.properties).length === 0) {
    multiEntitySchema = {};
  }

  return {
    singleAnswerSchema,
    multiEntitySchema,
  };
}

export async function mixSchemaObjects(
  finalSchema: any,
  singleAnswerResult: any,
  multiEntityResult: any
) {
  const finalResult: any = {};

  // Recursive helper function to merge results based on schema
  function mergeResults(schema: any, singleResult: any, multiResult: any) {
    const result: any = {};
    for (const key in schema.properties) {
      if (schema.properties[key].type === 'object' && schema.properties[key].properties) {
        // If the property is an object, recursively merge its properties
        result[key] = mergeResults(
          schema.properties[key],
          singleResult[key] || {},
          multiResult[key] || {}
        );
      } else if (schema.properties[key].type === 'array' && Array.isArray(multiResult[key])) {
        // If the property is an array, flatten the arrays from multiResult
        result[key] = multiResult[key].flat();
      } else if (singleResult.hasOwnProperty(key)) {
        result[key] = singleResult[key];
      } else if (multiResult.hasOwnProperty(key)) {
        result[key] = multiResult[key];
      }
    }
    return result;
  }

  // Merge the properties from the final schema
  Object.assign(finalResult, mergeResults(finalSchema, singleAnswerResult, multiEntityResult));

  return finalResult;
}

export function transformArrayToObject(
  originalSchema: any,
  arrayData: any[]
): any {
  const transformedResult: any = {};

  // Function to find the array key in a nested schema
  function findArrayKey(schema: any): string | null {
    for (const key in schema.properties) {
      if (schema.properties[key].type === 'array') {
        return key;
      } else if (schema.properties[key].type === 'object') {
        const nestedKey = findArrayKey(schema.properties[key]);
        if (nestedKey) {
          return `${key}.${nestedKey}`;
        }
      }
    }
    return null;
  }

  const arrayKeyPath = findArrayKey(originalSchema);
  if (!arrayKeyPath) {
    throw new Error("Schema does not contain an array property");
  }

  const arrayKeyParts = arrayKeyPath.split('.');
  const arrayKey = arrayKeyParts.pop();
  if (!arrayKey) {
    throw new Error("Array key not found in schema");
  }

  const parentSchema = arrayKeyParts.reduce((schema, key) => schema.properties[key], originalSchema);
  const itemSchema = parentSchema.properties[arrayKey].items;
  if (!itemSchema) {
    throw new Error("Item schema not found for array key");
  }

  // Initialize the array in the transformed result
  let currentLevel = transformedResult;
  arrayKeyParts.forEach(part => {
    if (!currentLevel[part]) {
      currentLevel[part] = {};
    }
    currentLevel = currentLevel[part];
  });
  currentLevel[arrayKey] = [];

  // Helper function to check if an object is already in the array
  function isDuplicateObject(array: any[], obj: any): boolean {
    return array.some(existingItem => isEqual(existingItem, obj));
  }

  // Helper function to validate if an object follows the schema
  function isValidObject(obj: any, schema: any): boolean {
    return Object.keys(schema.properties).every(key => {
      return obj.hasOwnProperty(key) && typeof obj[key] === schema.properties[key].type;
    });
  }

  // Iterate over each item in the arrayData
  arrayData.forEach(item => {
    let currentItem = item;
    arrayKeyParts.forEach(part => {
      if (currentItem[part]) {
        currentItem = currentItem[part];
      }
    });

    // Copy non-array properties from the parent object
    for (const key in parentSchema.properties) {
      if (key !== arrayKey && currentItem.hasOwnProperty(key) && !currentLevel.hasOwnProperty(key)) {
        currentLevel[key] = currentItem[key];
      }
    }

    if (Array.isArray(currentItem[arrayKey])) {
      currentItem[arrayKey].forEach((subItem: any) => {
        if (typeof subItem === 'object' && subItem !== null && isValidObject(subItem, itemSchema)) {
          // For arrays of objects, add only unique objects
          const transformedItem: any = {};
          let hasValidData = false;

          for (const key in itemSchema.properties) {
            if (subItem.hasOwnProperty(key) && subItem[key] !== undefined) {
              transformedItem[key] = subItem[key];
              hasValidData = true;
            }
          }

          if (hasValidData && !isDuplicateObject(currentLevel[arrayKey], transformedItem)) {
            currentLevel[arrayKey].push(transformedItem);
          }
        }
      });
    }

    // Handle merging of array properties
    for (const key in parentSchema.properties) {
      if (parentSchema.properties[key].type === 'array' && Array.isArray(currentItem[key])) {
        if (!currentLevel[key]) {
          currentLevel[key] = [];
        }
        currentItem[key].forEach((value: any) => {
          if (!currentLevel[key].includes(value) && !isDuplicateObject(currentLevel[arrayKey], value)) {
            currentLevel[key].push(value);
          }
        });
      }
    }
  });

  return transformedResult;
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

  let reqSchema = request.schema;
  reqSchema = await dereferenceSchema(reqSchema);

  console.log("links", JSON.stringify(links, null, 2));

  // agent evaluates if the schema or the prompt has an array with big amount of items
  // also it checks if the schema any other properties that are not arrays
  // if so, it splits the results into 2 types of completions:
  // 1. the first one is a completion that will extract the array of items
  // 2. the second one is multiple completions that will extract the items from the array
  const { isMultiEntity, multiEntityKeys, reasoning, keyIndicators } =
    await analyzeSchemaAndPrompt(links, request.schema, request.prompt ?? "");

  console.log("\nIs Multi Entity:", isMultiEntity);
  console.log("\nMulti Entity Keys:", multiEntityKeys);
  console.log("\nReasoning:", reasoning);
  console.log("\nKey Indicators:", keyIndicators);

  let rSchema = reqSchema;
  if (isMultiEntity) {
    console.log("is it getting here???")
    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(reqSchema, multiEntityKeys)
    rSchema = singleAnswerSchema;

    // const id = crypto.randomUUID();

    // const sc: StoredCrawl = {
    //   originUrl: request.urls[0].replace("/*",""),
    //   crawlerOptions: toLegacyCrawlerOptions({
    //     maxDepth: 15,
    //     limit: 5000,
    //     includePaths: [],
    //     excludePaths: [],
    //     ignoreSitemap: false,
    //     allowExternalLinks: false,
    //     allowBackwardLinks: true,
    //     allowSubdomains: false,
    //     ignoreRobotsTxt: false,
    //     deduplicateSimilarURLs: false,
    //     ignoreQueryParameters: false
    //   }),
    //   scrapeOptions: {
    //       formats: ["markdown"],
    //       onlyMainContent: true,
    //       waitFor: 0,
    //       mobile: false,
    //       removeBase64Images: true,
    //       fastMode: false,
    //       parsePDF: true,
    //       skipTlsVerification: false,
    //   },
    //   internalOptions: {
    //     disableSmartWaitCache: true,
    //     isBackgroundIndex: true
    //   },
    //   team_id: process.env.BACKGROUND_INDEX_TEAM_ID!,
    //   createdAt: Date.now(),
    //   plan: "hobby", // make it a low concurrency
    // };

    // // Save the crawl configuration
    // await saveCrawl(id, sc);

    // // Then kick off the job
    // await _addScrapeJobToBullMQ({
    //   url: request.urls[0].replace("/*",""),
    //   mode: "kickoff" as const,
    //   team_id: process.env.BACKGROUND_INDEX_TEAM_ID!,
    //   plan: "hobby", // make it a low concurrency
    //   crawlerOptions: sc.crawlerOptions,
    //   scrapeOptions: sc.scrapeOptions,
    //   internalOptions: sc.internalOptions,
    //   origin: "index",
    //   crawl_id: id,
    //   webhook: null,
    //   v1: true,
    // }, {}, crypto.randomUUID(), 50);

    // we restructure and make all of the arrays we need to fill into objects,
    // adding them to a single object so the llm can fill them one at a time
    // TODO: make this work for more complex schemas where arrays are not first level

    // let schemasForLLM: {} = {};
    // for (const key in largeArraysSchema) {
    //   const originalSchema = structuredClone(largeArraysSchema[key].items);
    //   console.log(
    //     "key",
    //     key,
    //     "\noriginalSchema",
    //     JSON.stringify(largeArraysSchema[key], null, 2),
    //   );
    //   let clonedObj = {
    //     type: "object",
    //     properties: {
    //       informationFilled: {
    //         type: "boolean",
    //       },
    //       data: {
    //         type: "object",
    //         properties: originalSchema.properties,
    //       },
    //     },
    //   };
    //   schemasForLLM[key] = clonedObj;
    // }

    const timeout = Math.floor((request.timeout || 40000) * 0.7) || 30000;
    const scrapePromises = links.map((url) => {
      if (!docsMap.get(url)) {
        return scrapeDocument(
          {
            url,
            teamId,
            plan,
            origin: request.origin || "api",
            timeout,
          },
          urlTraces,
        )
      }
      return docsMap.get(url);
    })
  
    let multyEntityDocs = (await Promise.all(scrapePromises)).filter(
      (doc): doc is Document => doc !== null,
    );

    docsMap = new Map([
      ...docsMap,
      ...multyEntityDocs
        .map((doc) => (doc.url ? [doc.url, doc] : undefined))
        .filter((entry): entry is [string, Document] => entry !== undefined)
    ]);
      
    for (const doc of multyEntityDocs) {
      console.log(">>>>>> doc", JSON.stringify(doc, null, 2));
      ajv.compile(multiEntitySchema);
      // Generate completions
      const multiEntityCompletion = await generateOpenAICompletions(
        logger.child({ method: "extractService/generateOpenAICompletions" }),
        {
          mode: "llm",
          systemPrompt:
            (request.systemPrompt ? `${request.systemPrompt}\n` : "") +
            "Always prioritize using the provided content to answer the question. Do not make up an answer. Do not hallucinate. Be concise and follow the schema always if provided. Here are the urls the user provided of which he wants to extract information from: " +
            links.join(", "),
          prompt: request.prompt,
          schema: multiEntitySchema,
        },
        buildDocument(doc),
        undefined,
        true,
      );
      console.log(">>>>>> multiEntityCompletion", JSON.stringify(multiEntityCompletion, null, 2));

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

      multiEntityCompletions.push(multiEntityCompletion.extract);
    }
    console.log(">>>>>> multiEntitySchema", JSON.stringify(multiEntitySchema, null, 2));
    console.log(">>>>>> ?? multiEntityCompletions", JSON.stringify(multiEntityCompletions, null, 2));
    multiEntityResult = transformArrayToObject(multiEntitySchema, multiEntityCompletions);
  }

  console.log(">>>>> multiEntityResult", JSON.stringify(multiEntityResult, null, 2));
  console.log("reqSchema", JSON.stringify(reqSchema, null, 2));
  console.log("rSchema", JSON.stringify(rSchema, null, 2));

  if (rSchema && Object.keys(rSchema).length > 0 && rSchema.properties && Object.keys(rSchema.properties).length > 0) {
    // Scrape documents
    const timeout = Math.floor((request.timeout || 40000) * 0.7) || 30000;
    let singleAnswerDocs: Document[] = [];

    const scrapePromises = links.map((url) => {
      if (!docsMap['url']) {
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
      singleAnswerDocs.push(...results.filter((doc): doc is Document => doc !== null));
    } catch (error) {
      return {
        success: false,
        error: error.message,
        extractId,
        urlTrace: urlTraces,
      };
    }

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

  const finalResult = await mixSchemaObjects(reqSchema, singleAnswerResult, multiEntityResult);

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
    docs: finalResult ?? {},
    time_taken: (new Date().getTime() - Date.now()) / 1000,
    team_id: teamId,
    mode: "extract",
    url: request.urls.join(", "),
    scrapeOptions: request,
    origin: request.origin ?? "api",
    num_tokens: 0, // completions?.numTokens ?? 0,
  }).then(() => {
    updateExtract(extractId, {
      status: "completed",
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
  };
}