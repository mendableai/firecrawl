import { supabase_service } from "../../services/supabase";
import { logger } from "../logger";
import { normalizeUrlOnlyHostname } from "../canonical-url";

interface LlmsTextCache {
  origin_url: string;
  llmstxt: string;
  llmstxt_full: string;
  max_urls: number;
}

export async function getLlmsTextFromCache(
  url: string,
  maxUrls: number,
): Promise<LlmsTextCache | null> {
  if (process.env.USE_DB_AUTHENTICATION !== "true") {
    return null;
  }

  const originUrl = normalizeUrlOnlyHostname(url);

  try {
    const { data, error } = await supabase_service
      .from("llm_texts")
      .select("*")
      .eq("origin_url", originUrl)
      .gte("max_urls", maxUrls) // Changed to gte since we want cached results with more URLs than requested
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return null;
    }

    return data;
  } catch (error) {
    logger.error("Failed to fetch LLMs text from cache", { error, originUrl });
    return null;
  }
}

export async function saveLlmsTextToCache(
  url: string,
  llmstxt: string,
  llmstxt_full: string,
  maxUrls: number,
): Promise<void> {
  if (process.env.USE_DB_AUTHENTICATION !== "true") {
    return;
  }

  const originUrl = normalizeUrlOnlyHostname(url);

  try {
    // First check if there's an existing entry with fewer URLs
    const { data: existingData } = await supabase_service
      .from("llm_texts")
      .select("*")
      .eq("origin_url", originUrl)
      .single();

    // Always update the entry for the origin URL
    const { error } = await supabase_service
      .from("llm_texts")
      .update({
        llmstxt,
        llmstxt_full,
        max_urls: maxUrls,
        updated_at: new Date().toISOString(),
      })
      .eq("origin_url", originUrl);

    if (error) {
      logger.error("Error saving LLMs text to cache", { error, originUrl });
    } else {
      logger.debug("Successfully cached LLMs text", { originUrl, maxUrls });
    }
  } catch (error) {
    logger.error("Failed to save LLMs text to cache", { error, originUrl });
  }
}
