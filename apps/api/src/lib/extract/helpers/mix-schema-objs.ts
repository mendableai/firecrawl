import type { Logger } from "winston";

export async function mixSchemaObjects(
  finalSchema: any,
  singleAnswerResult: any,
  multiEntityResult: any,
  logger?: Logger,
) {
  const finalResult: any = {};
  logger?.debug("Mixing schema objects.");

  // Recursive helper function to merge results based on schema
  function mergeResults(schema: any, singleResult: any, multiResult: any) {
    const result: any = {};
    for (const key in schema.properties) {
      if (
        schema.properties[key].type === "object" &&
        schema.properties[key].properties
      ) {
        // If the property is an object, recursively merge its properties
        result[key] = mergeResults(
          schema.properties[key],
          singleResult[key] || {},
          multiResult[key] || {},
        );
      } else if (
        schema.properties[key].type === "array" &&
        Array.isArray(multiResult[key])
      ) {
        // Preserve nested array values; flatten only scalar/object chunk wrappers.
        const items = schema.properties[key].items;
        const allowsArrayValues = (item: any): boolean =>
          item &&
          typeof item === "object" &&
          (item.type === "array" ||
            (Array.isArray(item.type) && item.type.includes("array")) ||
            (item.type === undefined && item.items !== undefined));
        const nested = Array.isArray(items)
          ? items.some(allowsArrayValues)
          : allowsArrayValues(items);
        result[key] = nested ? [...multiResult[key]] : multiResult[key].flat();
      } else if (singleResult.hasOwnProperty(key)) {
        result[key] = singleResult[key];
      } else if (multiResult.hasOwnProperty(key)) {
        result[key] = multiResult[key];
      }
    }
    return result;
  }

  // Merge the properties from the final schema
  Object.assign(
    finalResult,
    mergeResults(finalSchema, singleAnswerResult, multiEntityResult),
  );

  return finalResult;
}
