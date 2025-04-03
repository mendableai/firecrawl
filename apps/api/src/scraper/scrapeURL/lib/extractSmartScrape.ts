import { Logger } from "winston";
import { z } from "zod";
import {
  generateCompletions,
  GenerateCompletionsOptions,
} from "../transformers/llmExtract";
import { smartScrape } from "./smartScrape";
import { parseMarkdown } from "../../../lib/html-to-markdown";

const smartScrapeWrapperSchemaDefinition = {
  type: "object",
  properties: {
    // extractedData will be added dynamically
    shouldUseSmartscrape: {
      type: "boolean",
      description:
        "Set to `true` if any of the extractedData is null and you think you can find the information by performing user-like interactions (e.g., clicking buttons/accordions to reveal hidden text, scrolling down to load more content). SmartScrape can perform these actions to access the data.",
    },
    smartscrape_reasoning: {
      type: ["string", "null"],
      description:
        "Fill this only if shouldUseSmartscrape is true. Reasoning for why you think the page requires or doesnt require smartscrape. If it does explain which data you can't get with the initial page load.",
    },
    smartscrape_prompt: {
      type: ["string", "null"],
      description:
        "Prompt to use for Smartscrape refinement if shouldUseSmartscrape is true. Explain exactly what actions smartscrape should do. Smartscrape is a tool that can perform actions on the page like clicking, scrolling, etc. It cant extract data it will just return the pages and we will handle the extraction.",
    },
  },
  additionalProperties: false, // Keep this for the top-level wrapper
  required: ["extractedData", "shouldUseSmartscrape"],
  // Note: Dynamically adding 'smartscrape_reasoning' and 'smartscrape_prompt' to required
  // based on shouldUseSmartscrape is complex in standard JSON schema and might depend on the LLM's interpretation.
  // Keeping extractedData and shouldUseSmartscrape as the base requirements.
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
) {
  // Make the user's schema nullable *and* ensure nested objects have additionalProperties:false
  const nullableAndStrictSchema = makeSchemaNullable(originalSchema);

  const wrappedSchema = {
    ...smartScrapeWrapperSchemaDefinition, // Uses the wrapper defined above
    properties: {
      extractedData: nullableAndStrictSchema, // Nest the modified original schema
      ...smartScrapeWrapperSchemaDefinition.properties, // Add smartscrape fields
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
  url,
}: {
  extractOptions: GenerateCompletionsOptions;
  url: string;
}): Promise<{ extractedDataArray: any[]; warning: any }> {
  //WRAP SCHEMA
  const schema = extractOptions.options.schema;
  const logger = extractOptions.logger;

  console.log("!!!!!!!!!!!!!!!!!!hereee");
  const { schemaToUse } = prepareSmartScrapeSchema(schema, logger);
  const extractOptionsNewSchema = {
    ...extractOptions,
    options: { ...extractOptions.options, schema: schemaToUse },
  };
  console.log("schema", schema);
  console.log("schemaToUse", schemaToUse);

  const { extract, warning, totalUsage } = await generateCompletions(
    extractOptionsNewSchema,
  );
  console.log("extract", extract);

  // const {
  //   extractedData,
  //   shouldUseSmartscrape,
  //   smartscrape_reasoning,
  //   smartscrape_prompt,
  // } = processSmartScrapeResult(extract, logger);

  const shouldUseSmartscrape = extract?.shouldUseSmartscrape;
  const smartscrape_reasoning = extract?.smartscrape_reasoning;
  const smartscrape_prompt = extract?.smartscrape_prompt;
  let extractedData = extract?.extractedData;

  console.log("shouldUseSmartscrape", shouldUseSmartscrape);
  console.log("smartscrape_reasoning", smartscrape_reasoning);
  console.log("smartscrape_prompt", smartscrape_prompt);
  if (shouldUseSmartscrape) {
    const smartscrapeResult = await smartScrape(url, smartscrape_prompt);

    const htmls = smartscrapeResult.scrapedPages.map((page) => page.html);
    const markdowns = await Promise.all(
      htmls.map(async (html) => await parseMarkdown(html)),
    );

    extractedData = await Promise.all(
      markdowns.map(async (markdown) => {
        const newExtractOptions = {
          ...extractOptions,
          markdown: markdown,
        };
        const { extract, warning, totalUsage, model } =
          await generateCompletions(newExtractOptions);
        return extract;
      }),
    );

    // console.log("markdowns", markdowns);
    // extractedData = smartscrapeResult;
  } else {
    extractedData = [extractedData];
  }

  return { extractedDataArray: extractedData, warning: warning };
}
