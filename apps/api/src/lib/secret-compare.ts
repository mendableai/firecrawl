import { timingSafeEqual } from "node:crypto";

export function timingSafeSecretEqual(
  provided: unknown,
  expected?: string,
): boolean {
  if (typeof provided !== "string" || !provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
