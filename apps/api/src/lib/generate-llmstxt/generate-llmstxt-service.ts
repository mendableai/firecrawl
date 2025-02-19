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
import { billTeam } from "../../services/billing/credit_billing";
import { logJob } from "../../services/logging/log_job";

interface GenerateLLMsTextServiceOptions {
  generationId: string;
  teamId: string;
  plan: PlanType;
  url: string;
  maxUrls: number;
  showFullText: boolean;
  subId?: string;
}


const DescriptionSchema = z.object({
  description: z.string(),
  title: z.string(),
});

export async function performGenerateLlmsTxt(options: GenerateLLMsTextServiceOptions) {
  const openai = new OpenAI();
  const { generationId, teamId, plan, url, maxUrls, showFullText, subId } = options;
  const startTime = Date.now();
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


    // Process URLs in batches of 10
    for (let i = 0; i < urls.length; i += 10) {
      const batch = urls.slice(i, i + 10);
      
      const batchResults = await Promise.all(batch.map(async (url) => {
        _logger.debug(`Scraping URL: ${url}`);
        try {
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

          if (!document || !document.markdown) {
            logger.error(`Failed to scrape URL ${url}`);
            return null;
          }

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

          const parsedResponse = completion.choices[0].message.parsed;
          return {
            title: parsedResponse!.title,
            description: parsedResponse!.description,
            url: document.metadata?.url,
            markdown: document.markdown
          };
        } catch (error) {
          logger.error(`Failed to process URL ${url}`, { error });
          return null;
        }
      }));

      // Process successful results from batch
      for (const result of batchResults) {
        if (!result) continue;
        
        llmstxt += `- [${result.title}](${result.url}): ${result.description}\n`;
        llmsFulltxt += `## ${result.title}\n${result.markdown}\n\n`;
      }

      // Update progress after each batch
      await updateGeneratedLlmsTxt(generationId, {
        status: "processing",
        generatedText: llmstxt,
        fullText: llmsFulltxt,
      });
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

    // Log job with token usage and sources
    await logJob({
      job_id: generationId,
      success: true,
      message: "LLMs text generation completed",
      num_docs: urls.length,
      docs: [{ llmstxt: llmstxt, llmsfulltxt: llmsFulltxt }],
      time_taken: (Date.now() - startTime) / 1000,
      team_id: teamId,
      mode: "llmstxt",
      url: url,
      scrapeOptions: options,
      origin: "api",
      num_tokens: 0,
      tokens_billed: 0,
      sources: {},
    });

    // Bill team for usage
    billTeam(teamId, subId, urls.length, logger).catch(
      (error) => {
        logger.error(
          `Failed to bill team ${teamId} for ${urls.length} urls`, { teamId, count: urls.length, error },
        );
      },
    );

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