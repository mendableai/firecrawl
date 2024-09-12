import { ZodType } from "zod";

export function isZodSchema(schema: unknown): schema is ZodType {
  return schema instanceof ZodType;
}