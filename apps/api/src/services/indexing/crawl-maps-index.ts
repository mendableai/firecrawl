import { logger } from "../../lib/logger";
import {
  normalizeUrl,
  normalizeUrlOnlyHostname,
} from "../../lib/canonical-url";
import { supabase_service } from "../supabase";

export async function saveCrawlMap(originUrl: string, visitedUrls: string[]) {
  originUrl = normalizeUrlOnlyHostname(originUrl);
  // Fire and forget the upload to Supabase
  try {
    // Standardize URLs to canonical form (https, no www)
    const standardizedUrls = [
      ...new Set(
        visitedUrls.map((url) => {
          return normalizeUrl(url);
        }),
      ),
    ];
    // First check if entry exists for this origin URL
    const { data: existingMap } = await supabase_service
      .from("crawl_maps")
      .select("urls")
      .eq("origin_url", originUrl)
      .single();

    if (existingMap) {
      // Merge URLs, removing duplicates
      const mergedUrls = [
        ...new Set([...existingMap.urls, ...standardizedUrls]),
      ];

      const { error } = await supabase_service
        .from("crawl_maps")
        .update({
          urls: mergedUrls,
          num_urls: mergedUrls.length,
          updated_at: new Date().toISOString(),
        })
        .eq("origin_url", originUrl);

      if (error) {
        logger.error("Failed to update crawl map", { error });
      }
    } else {
      // Insert new entry if none exists
      const { error } = await supabase_service.from("crawl_maps").insert({
        origin_url: originUrl,
        urls: standardizedUrls,
        num_urls: standardizedUrls.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) {
        logger.error("Failed to save crawl map", { error });
      }
    }
  } catch (error) {
    logger.error("Error saving crawl map", { error });
  }
}
