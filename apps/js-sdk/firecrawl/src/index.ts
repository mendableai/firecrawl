// Unified entrypoint for Firecrawl JS SDK
// - Default export: unified Firecrawl (v2 by default, v1 under .v1)
// - Named export FirecrawlClient: direct v2 client
// - Named export FirecrawlAppV1: legacy v1 class
// - Re-export v2 types

export { FirecrawlClient } from "./v2/client";
export * from "./v2/types";
export { default as FirecrawlAppV1 } from "./v1";

import V1 from "./v1";
import { FirecrawlClient as V2 } from "./v2/client";
import type { FirecrawlAppConfig } from "./v1";

export class Firecrawl extends V2 {
  public v1: V1;

  constructor(opts: FirecrawlAppConfig = {}) {
    super(opts as any);
    this.v1 = new V1(opts);
  }
}

export default Firecrawl;

