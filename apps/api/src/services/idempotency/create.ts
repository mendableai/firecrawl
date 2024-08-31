import { Request } from "express";
import { Logger } from "../../../src/lib/logger";
import db from "../db";
import { idempotencyKeys } from "../db/schema";

export async function createIdempotencyKey(
  req: Request,
): Promise<string> {
  const idempotencyKey = req.headers['x-idempotency-key'] as string;
  if (!idempotencyKey) {
    throw new Error("No idempotency key provided in the request headers.");
  }

  try {
    await db
      .insert(idempotencyKeys)
      .values({
        key: idempotencyKey,
      });
  } catch (error) {
    Logger.error(`Failed to create idempotency key: ${error}`);
    throw error;
  }

  return idempotencyKey;
}
