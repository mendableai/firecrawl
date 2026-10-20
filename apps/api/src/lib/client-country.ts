import type { Request } from "express";
import { logger } from "./logger";

type Lookup = (ip: string) => { country?: string } | null;

let lookup: Lookup | undefined;

// Country-only database, built at image build time and never downloaded at runtime.
function loadLookup(): Lookup {
  process.env.ILA_FIELDS ??= "country";
  process.env.ILA_IP_LOCATION_DB ??= "geolite2-country";
  process.env.ILA_AUTO_UPDATE ??= "false";
  process.env.ILA_SILENT ??= "true";
  return (lookup ??= require("ip-location-api").lookup as Lookup);
}

/** ISO 3166-1 alpha-2 country of the caller's IP, or undefined when it cannot be resolved. */
export function clientCountry(req: Pick<Request, "ip">): string | undefined {
  if (!req.ip) return undefined;
  try {
    return loadLookup()(req.ip)?.country || undefined;
  } catch (error) {
    logger.warn("IP country lookup failed", { error });
    return undefined;
  }
}
