import { Request } from "express";
import { validate as isUuid } from 'uuid';
import { Logger } from "../../../src/lib/logger";
import db from "../db";
import { idempotencyKeys } from "../db/schema";
import { eq } from "drizzle-orm";

export async function validateIdempotencyKey(
  req: Request,
): Promise<boolean> {
  const idempotencyKey = req.headers['x-idempotency-key'];
  if (!idempotencyKey) {
    // // not returning for missing idempotency key for now
    return true;
  }

  // Ensure idempotencyKey is treated as a string
  const key = Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey;
  if (!isUuid(key)) {
    Logger.debug("Invalid idempotency key provided in the request headers.");
    return false;
  }

  let data;
  try {
    data = await db
      .select({ key: idempotencyKeys.key })
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key));
  } catch (error) {
    Logger.error(`Error validating idempotency key: ${error}`);
  }
  
  if (!data || data.length === 0) {
    return true;
  }

  return false;
}
