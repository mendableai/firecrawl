import { logger as _logger } from "../logger";
import { updateGeneratedLlmsTxt } from "./generate-llmstxt-redis";
import { getMapResults } from "../../controllers/v1/map";
import { MapResponse, ScrapeResponse, Document } from "../../controllers/v1/types";
import { Response } from "express";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { scrapeDocument } from "../extract/document-scraper";
import { PlanType } from "../../types";
import { getLlmsTextFromCache, saveLlmsTextToCache } from "./generate-llmstxt-supabase";

interface GenerateLLMsTextServiceOptions {
  generationId: string;
  teamId: string;
  plan: PlanType;
  url: string;
  maxUrls: number;
  showFullText: boolean;
}


const DescriptionSchema = z.object({
  description: z.string(),
  title: z.string(),
});

export async function performGenerateLlmsTxt(options: GenerateLLMsTextServiceOptions) {
  const openai = new OpenAI();
  const { generationId, teamId, plan, url, maxUrls, showFullText } = options;
  
  const logger = _logger.child({
    module: "generate-llmstxt",
    method: "performGenerateLlmsTxt",
    generationId,
    teamId,
  });

  try {
    // Check cache first
    const cachedResult = await getLlmsTextFromCache(url, maxUrls);
    if (cachedResult) {
      logger.info("Found cached LLMs text", { url });
      
      // Update final result with cached text
      await updateGeneratedLlmsTxt(generationId, {
        status: "completed",
        generatedText: cachedResult.llmstxt,
        fullText: cachedResult.llmstxt_full,
        showFullText: showFullText,
      });

      return {
        success: true,
        data: {
          generatedText: cachedResult.llmstxt,
          fullText: cachedResult.llmstxt_full,
          showFullText: showFullText,
        },
      };
    }

    // If not in cache, proceed with generation
    // First, get all URLs from the map controller
    const mapResult = await getMapResults({
      url,
      teamId,
      plan,
      limit: maxUrls,
      includeSubdomains: false,
      ignoreSitemap: false,
      includeMetadata: true,
    });

    if (!mapResult || !mapResult.links) {
      throw new Error(`Failed to map URLs`);
    }

    _logger.debug("Mapping URLs", mapResult.links);

    const urls = mapResult.links;
    let llmstxt = `# ${url} llms.txt\n\n`;
    let llmsFulltxt = `# ${url} llms-full.txt\n\n`;


    // Scrape each URL
    for (const url of urls) {
      _logger.debug(`Scraping URL: ${url}`);
      const document = await scrapeDocument(
        {
          url,
          teamId,
          plan,
          origin: url,
          timeout: 30000,
          isSingleUrl: true,
        },
        [],
        logger,
        { onlyMainContent: true }
      );

      if (!document) {
        logger.error(`Failed to scrape URL ${url}`);
        continue;
      }

      // Process scraped result
      if (!document.markdown) continue;

      _logger.debug(`Generating description for ${document.metadata?.url}`);
      
      const completion = await openai.beta.chat.completions.parse({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user", 
            content: `Generate a 9-10 word description and a 3-4 word title of the entire page based on ALL the content one will find on the page for this url: ${document.metadata?.url}. This will help in a user finding the page for its intended purpose. Here is the content: ${document.markdown}`
          }
        ],
        response_format: zodResponseFormat(DescriptionSchema, "description")
      });

      try {
        const parsedResponse = completion.choices[0].message.parsed;
        const description = parsedResponse!.description;
        const title = parsedResponse!.title;
        
        llmstxt += `- [${title}](${document.metadata?.url}): ${description}\n`;
        llmsFulltxt += `## ${title}\n${document.markdown}\n\n`;

        // Update progress with both generated text and full text
        await updateGeneratedLlmsTxt(generationId, {
          status: "processing", 
          generatedText: llmstxt,
          fullText: llmsFulltxt,
        });
      } catch (error) {
        logger.error(`Failed to parse LLM response for ${document.metadata?.url}`, { error });
        continue;
      }
    }

    // After successful generation, save to cache
    await saveLlmsTextToCache(url, llmstxt, llmsFulltxt, maxUrls);

    // Update final result with both generated text and full text
    await updateGeneratedLlmsTxt(generationId, {
      status: "completed",
      generatedText: llmstxt,
      fullText: llmsFulltxt,
      showFullText: showFullText,
    });

    return {
      success: true,
      data: {
        generatedText: llmstxt,
        fullText: llmsFulltxt,
        showFullText: showFullText,
      },
    };

  } catch (error: any) {
    logger.error("Generate LLMs text error", { error });

    await updateGeneratedLlmsTxt(generationId, {
      status: "failed",
      error: error.message || "Unknown error occurred",
    });

    throw error;
  }
} 