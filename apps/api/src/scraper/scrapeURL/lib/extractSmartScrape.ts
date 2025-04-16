import { Logger } from "winston";
import { z } from "zod";
import {
  generateCompletions,
  GenerateCompletionsOptions,
  generateSchemaFromPrompt,
} from "../transformers/llmExtract";
import { smartScrape } from "./smartScrape";
import { parseMarkdown } from "../../../lib/html-to-markdown";
import { getModel } from "../../../lib/generic-ai";
import { TokenUsage } from "../../../controllers/v1/types";
import type { SmartScrapeResult } from "./smartScrape";

const commonSmartScrapeProperties = {
  shouldUseSmartscrape: {
    type: "boolean",
    description:
      "Set to `true` if any of the extractedData is null and you think you can find the information by performing user-like interactions (e.g., clicking buttons/accordions to reveal hidden text, login, inputs etc.). SmartScrape can perform these actions to access the data.",
  },
  // Note: extractedData is added dynamically in prepareSmartScrapeSchema
};

// Define common properties for reasoning and prompt
const commonReasoningPromptProperties = {
  smartscrape_reasoning: {
    type: ["string", "null"],
    // Using the more detailed multi-step description as the common one
    description:
      "Reasoning for why a SmartScrape is needed. Explain which data is missing or requires interaction.",
  },
  smartscrape_prompt: {
    type: ["string", "null"],
    description: `A clear, outcome-focused prompt describing what information to find on the page. 
      Example: "Find the product specifications in the expandable section" rather than "Click the button to reveal product specs".
      Used by the smart scraping agent to determine what actions to take.
      Dont mention anything about extraction, smartscrape just returns page content.`,
  },
};

// Schema for single-step SmartScrape interaction
const smartScrapeWrapperSchemaDefinition = {
  type: "object",
  properties: {
    ...commonSmartScrapeProperties, // Include shared base properties
    ...commonReasoningPromptProperties, // Include shared reasoning/prompt properties
    // extractedData will be added dynamically
  },
  additionalProperties: false,
  required: ["extractedData", "shouldUseSmartscrape"],
};

// Schema for multi-step SmartScrape interaction
const multiSmartScrapeWrapperSchemaDefinition = {
  type: "object",
  properties: {
    ...commonSmartScrapeProperties, // Include shared base properties
    smartScrapePages: {
      type: "array",
      description:
        "Make an entry for each page we want to run smart scrape on, no matter how many actions it should be one entry per page.",
      items: {
        type: "object",
        properties: {
          page_index: {
            // Specific to items within the array
            type: "number",
            description: "The index of the page in the SmartScrape process.",
          },
          ...commonReasoningPromptProperties, // Include shared reasoning/prompt properties here too
        },
        // required: ["page_index", "smartscrape_reasoning", "smartscrape_prompt"], // If needed per step
        // additionalProperties: false,
      },
    },
    // extractedData will be added dynamically
  },
  additionalProperties: false,
  required: ["extractedData", "shouldUseSmartscrape"],
};

//TODO: go over and check
// should add null to all types
// type:string should be type:["string","null"]
export function makeSchemaNullable(schema: any): any {
  if (typeof schema !== "object" || schema === null) {
    return schema; // Base case: not an object/array or is null
  }

  if (Array.isArray(schema)) {
    return schema.map(makeSchemaNullable); // Recurse for array items
  }

  // Process object properties
  const newSchema: { [key: string]: any } = {};
  let isObject = false; // Flag to track if this level is an object type

  for (const key in schema) {
    if (key === "additionalProperties") {
      continue; // Skip existing additionalProperties, we'll set it later if needed
    }

    if (key === "type") {
      const currentType = schema[key];
      let finalType: string | string[];

      if (typeof currentType === "string") {
        if (currentType === "object") isObject = true;
        finalType =
          currentType === "null" ? currentType : [currentType, "null"];
      } else if (Array.isArray(currentType)) {
        if (currentType.includes("object")) isObject = true;
        finalType = currentType.includes("null")
          ? currentType
          : [...currentType, "null"];
      } else {
        finalType = currentType; // Handle unexpected types?
      }
      newSchema[key] = finalType;
    } else if (typeof schema[key] === "object" && schema[key] !== null) {
      // Recurse for nested objects (properties, items, definitions, etc.)
      newSchema[key] = makeSchemaNullable(schema[key]);
      if (key === "properties") {
        // Having a 'properties' key strongly implies an object type
        isObject = true;
      }
    } else {
      // Copy other properties directly (like required, description, etc.)
      newSchema[key] = schema[key];
    }
  }

  // **Crucial Fix:** If this schema represents an object type, add additionalProperties: false
  if (isObject) {
    // Ensure 'properties' exists if 'type' was 'object' but 'properties' wasn't defined
    if (!newSchema.properties) {
      newSchema.properties = {};
    }
    newSchema.additionalProperties = false;
  }

  return newSchema;
}

/**
 * Wraps the original schema with SmartScrape fields if an original schema exists.
 *
 * @param originalSchema The user-provided schema (JSON Schema object or Zod schema).
 * @param logger Winston logger instance.
 * @returns An object containing the schema to use for the LLM call and whether wrapping occurred.
 */
export function prepareSmartScrapeSchema(
  originalSchema: any | z.ZodTypeAny | undefined,
  logger: Logger,
  isSingleUrl: boolean,
) {
  // Make the user's schema nullable *and* ensure nested objects have additionalProperties:false
  const nullableAndStrictSchema = originalSchema;

  let smartScrapeWrapScehma;
  if (isSingleUrl) {
    smartScrapeWrapScehma = smartScrapeWrapperSchemaDefinition;
  } else {
    smartScrapeWrapScehma = multiSmartScrapeWrapperSchemaDefinition;
  }

  const wrappedSchema = {
    ...smartScrapeWrapScehma, // Uses the wrapper defined above
    properties: {
      extractedData: nullableAndStrictSchema, // Nest the modified original schema
      ...smartScrapeWrapScehma.properties, // Add smartscrape fields
    },
    // required is inherited from smartScrapeWrapperSchemaDefinition
    // additionalProperties:false is inherited from smartScrapeWrapperSchemaDefinition for the top level
  };

  logger.info("Wrapping original schema with SmartScrape fields.", {
    // Limit logging potentially large schemas
    wrappedSchemaKeys: Object.keys(wrappedSchema.properties),
  });
  return { schemaToUse: wrappedSchema };
}

export async function extractData({
  extractOptions,
  urls,
  useAgent,
  extractId,
}: {
  extractOptions: GenerateCompletionsOptions;
  urls: string[];
  useAgent: boolean;
  extractId?: string;
}): Promise<{
  extractedDataArray: any[];
  warning: any;
  smartScrapeCallCount: number;
  otherCallCount: number;
  smartScrapeCost: number;
  otherCost: number;
  costLimitExceededTokenUsage: number | null;
}> {
  let schema = extractOptions.options.schema;
  const logger = extractOptions.logger;
  const isSingleUrl = urls.length === 1;
  let smartScrapeCost = 0;
  let otherCost = 0;
  let smartScrapeCallCount = 0;
  let otherCallCount = 0;
  let costLimitExceededTokenUsage: number | null = null;
  // TODO: remove the "required" fields here!! it breaks o3-mini

  if (!schema && extractOptions.options.prompt) {
    logger.info("Generating schema from prompt");
    const genRes = await generateSchemaFromPrompt(extractOptions.options.prompt, logger);
    otherCallCount++;
    otherCost += genRes.cost;
    schema = genRes.extract;
  }

  const { schemaToUse } = prepareSmartScrapeSchema(schema, logger, isSingleUrl);
  const extractOptionsNewSchema = {
    ...extractOptions,
    options: { ...extractOptions.options, schema: schemaToUse },
  };
  // console.log("schema", schema);
  // console.log("schemaToUse", schemaToUse);

  let extract: any,
    warning: string | undefined,
    totalUsage: TokenUsage | undefined;

  // checks if using smartScrape is needed for this case
  try {
    const {
      extract: e,
      warning: w,
      totalUsage: t,
      cost: c,
    } = await generateCompletions({
      ...extractOptionsNewSchema,
      model: getModel("gemini-2.5-pro-preview-03-25", "vertex"),
      retryModel: getModel("gemini-2.5-pro-preview-03-25", "google"),
    });
    extract = e;
    warning = w;
    totalUsage = t;
    otherCost += c;
    otherCallCount++;
  } catch (error) {
    logger.error(
      "failed during extractSmartScrape.ts:generateCompletions",
      { error },
    );
    // console.log("failed during extractSmartScrape.ts:generateCompletions", error);
  }

  let extractedData = extract?.extractedData;

  // console.log("shouldUseSmartscrape", extract?.shouldUseSmartscrape);
  // console.log("smartscrape_reasoning", extract?.smartscrape_reasoning);
  // console.log("smartscrape_prompt", extract?.smartscrape_prompt);
  try {
    logger.info("Smart schema resolved", {
      useAgent,
      shouldUseSmartscrape: extract?.shouldUseSmartscrape,
      url: urls,
      prompt: extract?.smartscrape_prompt,
    })

    if (useAgent && extract?.shouldUseSmartscrape) {
      let smartscrapeResults: SmartScrapeResult[];
      if (isSingleUrl) {
        smartscrapeResults = [
          await smartScrape(urls[0], extract?.smartscrape_prompt, extractId),
        ];
        smartScrapeCost += smartscrapeResults[0].tokenUsage;
        smartScrapeCallCount++;
      } else {
        const pages = extract?.smartscrapePages;
        //do it async promiseall instead
        smartscrapeResults = await Promise.all(
          pages.map(async (page) => {
            return await smartScrape(
              urls[page.page_index],
              page.smartscrape_prompt,
              extractId,
            );
          }),
        );
        smartScrapeCost += smartscrapeResults.reduce(
          (acc, result) => acc + result.tokenUsage,
          0,
        );
        smartScrapeCallCount += pages.length;
      }
      // console.log("smartscrapeResults", smartscrapeResults);

      const scrapedPages = smartscrapeResults.map(
        (result) => result.scrapedPages,
      );
      // console.log("scrapedPages", scrapedPages);
      const htmls = scrapedPages.flat().map((page) => page.html);
      // console.log("htmls", htmls);
      const markdowns = await Promise.all(
        htmls.map(async (html) => await parseMarkdown(html)),
      );
      // console.log("markdowns", markdowns);
      extractedData = await Promise.all(
        markdowns.map(async (markdown) => {
          const newExtractOptions = {
            ...extractOptions,
            markdown: markdown,
          };
          const { extract, warning, totalUsage, model, cost } =
            await generateCompletions(newExtractOptions);
          otherCost += cost;
          otherCallCount++;
          return extract;
        }),
      );

      // console.log("markdowns", markdowns);
      // extractedData = smartscrapeResult;
    } else {
      extractedData = [extractedData];
    }
  } catch (error) {
    console.error(">>>>>>>extractSmartScrape.ts error>>>>>\n", error);
    if (error instanceof Error && error.message === "Cost limit exceeded") {
      costLimitExceededTokenUsage = (error as any).cause.tokenUsage;
      warning = "Smart scrape cost limit exceeded." + (warning ? " " + warning : "")
    } else {
      throw error;
    }
  }

  return {
    extractedDataArray: extractedData,
    warning: warning,
    smartScrapeCallCount: smartScrapeCallCount,
    otherCallCount: otherCallCount,
    smartScrapeCost: smartScrapeCost,
    otherCost: otherCost,
    costLimitExceededTokenUsage: costLimitExceededTokenUsage,
  };
}
