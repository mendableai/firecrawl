import { Request } from "express";
export async function createIdempotencyKey(
  req: Request,
): Promise<string> {
  const idempotencyKey = req.headers['x-idempotency-key'] as string;
  if (!idempotencyKey) {
    throw new Error("No idempotency key provided in the request headers.");
  }

  return idempotencyKey;
}
