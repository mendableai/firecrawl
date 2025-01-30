import { logger } from "../../lib/logger";
import {
  normalizeUrl,
  normalizeUrlOnlyHostname,
} from "../../lib/canonical-url";
import { supabase_service } from "../../services/supabase";

/**
 * Query the sitemap index for a given URL
 * @param url The URL to query
 * @returns A list of URLs found in the sitemap index aggregated from all sitemaps
 */
import { withAuth } from "../../lib/withAuth";

async function querySitemapIndexFunction(url: string) {
  const originUrl = normalizeUrlOnlyHostname(url);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data, error } = await supabase_service
        .from("crawl_maps")
        .select("urls, updated_at")
        .eq("origin_url", originUrl)
        .order("updated_at", { ascending: false });

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return { urls: [], lastUpdated: new Date(0) };
      }

      const allUrls = [
        ...new Set(
          data
            .map((entry) => entry.urls)
            .flat()
            .map((url) => normalizeUrl(url)),
        ),
      ];
      return { urls: allUrls, lastUpdated: data[0].updated_at };
    } catch (error) {
      logger.error("(sitemap-index) Error querying the index", {
        error,
        attempt,
      });

      if (attempt === 3) {
        return { urls: [], lastUpdated: new Date(0) };
      }
    }
  }

  return { urls: [], lastUpdated: new Date(0) };
}

export const querySitemapIndex = withAuth(querySitemapIndexFunction, {
  urls: [],
  lastUpdated: new Date(0),
});
