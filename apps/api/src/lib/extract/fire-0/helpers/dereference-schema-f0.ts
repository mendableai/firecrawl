import { dereference } from "@apidevtools/json-schema-ref-parser";

export async function dereferenceSchema_F0(schema: any): Promise<any> {
  try {
    return await dereference(schema);
  } catch (error) {
    console.error("Failed to dereference schema:", error);
    throw error;
  }
}
