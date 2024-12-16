import { Request } from "express";
import { supabase_service } from "../supabase";
import { logger } from "../../../src/lib/logger";

export async function createIdempotencyKey(req: Request): Promise<string> {
  const idempotencyKey = req.headers["x-idempotency-key"] as string;
  if (!idempotencyKey) {
    throw new Error("No idempotency key provided in the request headers.");
  }

  const { data, error } = await supabase_service
    .from("idempotency_keys")
    .insert({ key: idempotencyKey });

  if (error) {
    logger.error(`Failed to create idempotency key: ${error}`);
    throw error;
  }

  return idempotencyKey;
}
