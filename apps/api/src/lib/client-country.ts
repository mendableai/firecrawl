import type { Request } from "express";
import * as geoip from "geoip-country";

/** ISO 3166-1 alpha-2 country of the caller's IP, or undefined when it cannot be resolved. */
export function clientCountry(req: Pick<Request, "ip">): string | undefined {
  if (!req.ip) return undefined;
  return geoip.lookup(req.ip)?.country || undefined;
}
