export async function spreadSchemas(
  schema: any,
  keys: string[],
): Promise<{
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
