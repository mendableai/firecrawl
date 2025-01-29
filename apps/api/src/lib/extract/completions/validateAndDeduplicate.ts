import { Logger } from "winston";
import { generateOpenAICompletions } from "../../../scraper/scrapeURL/transformers/llmExtract";

export async function validateAndDeduplicate({
  data,
  schema,
  logger,
}: {
  data: {extract: any, url: string}[];
  schema: any;
  logger: Logger;
}) {
  // // Add _sources field to each extract object before validation
  // const dataWithSources = data.map(item => ({
  //   ...item.extract,
  //   _sources: [item.url]
  // }));

  // // Modify schema to include _sources field for each item in arrays
  // const modifiedSchema = {
  //   ...schema,
  //   properties: {
  //     ...schema.properties
  //   }
  // };

  // // Add _sources to each property that is an array
  // Object.entries(modifiedSchema.properties).forEach(([key, value]: [string, any]) => {
  //   if (value.type === 'array') {
  //     // For arrays of strings, wrap each string in an object with _sources
  //     if (value.items && value.items.type === 'string') {
  //       value.items = {
  //         type: 'object',
  //         properties: {
  //           value: {
  //             type: 'string'
  //           },
  //           _sources: {
  //             type: 'array',
  //             items: {
  //               type: 'string'
  //             }
  //           }
  //         }
  //       };
  //     }
  //     // For arrays of objects, add _sources to the object properties
  //     else if (value.items && value.items.type === 'object') {
  //       value.items.properties = {
  //         ...value.items.properties,
  //         _sources: {
  //           type: 'array',
  //           items: {
  //             type: 'string'
  //           }
  //         }
  //       };
  //     }
  //   }
  // });

  // // Transform string arrays into object arrays with sources
  // Object.entries(dataWithSources).forEach(([key, value]: [string, any]) => {
  //   Object.entries(value).forEach(([propKey, propValue]: [string, any]) => {
  //     if (Array.isArray(propValue) && propValue.length > 0 && typeof propValue[0] === 'string') {
  //       value[propKey] = propValue.map(str => ({
  //         value: str,
  //         _sources: value._sources
  //       }));
  //     }
  //   });
  // });

  const completion = await generateOpenAICompletions(
    logger.child({ method: "extractService/validateAndDeduplicate" }),
    {
      mode: "llm",
      systemPrompt: `You are a data validator and deduplicator. Your task is to:
      1. Remove any duplicate entries in the data extracted by merging that into a single object according to the provided schema
      2. Ensure all data matches the provided schema
      3. Keep only the highest quality and most complete entries when duplicates are found
      4. For arrays of strings, each string should be wrapped in an object with a "value" field containing the string and "_sources" field containing source URLs
      5. For arrays of objects, maintain a "_sources" field that lists the URLs where that specific item was found

      Do not change anything else. If data is null keep it null. If the schema is not provided, return the data as is.`,
      prompt: `Please validate and merge the duplicate entries in this data according to the schema provided. For arrays, track source URLs for each item:\n

      <start of extract data>

      ${JSON.stringify(data)}
      
      <end of extract data>

      <start of schema>

      ${JSON.stringify(schema)}

      <end of schema>
      `,
      schema: schema,
    },
    "",
    undefined,
    true,
    "gpt-4o",
  );

  // Transform the response back - unwrap string values from objects
  // const transformedExtract = completion.extract;
  // Object.entries(transformedExtract).forEach(([key, value]: [string, any]) => {
  //   if (Array.isArray(value) && value.length > 0 && value[0].value) {
  //     transformedExtract[key] = value.map(item => item.value);
  //   }
  // });

  // console.log(transformedExtract);
  return {
    extract: completion.extract,
    totalUsage: completion.totalUsage,
  };
}
