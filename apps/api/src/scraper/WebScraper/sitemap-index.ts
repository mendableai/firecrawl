import { logger } from "../../lib/logger";
import { normalizeUrlOnlyHostname } from "../../lib/canonical-url";
import { supabase_service } from "../../services/supabase";

/**
 * Query the sitemap index for a given URL
 * @param url The URL to query
 * @returns A list of URLs found in the sitemap index aggregated from all sitemaps
 */
import { withAuth } from "../../lib/withAuth";

async function querySitemapIndexFunction(url: string) {
  const originUrl = normalizeUrlOnlyHostname(url);

  const { data, error } = await supabase_service
    .from("crawl_maps")
    .select("urls")
    .eq("origin_url", originUrl);

  if (error) {
    logger.error("(sitemap-index) Error querying the index", { error });
    return [];
  }

  const allUrls = data.map((entry) => entry.urls).flat();

  return allUrls;
}

export const querySitemapIndex = withAuth(querySitemapIndexFunction, []);
