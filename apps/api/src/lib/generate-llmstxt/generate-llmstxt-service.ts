import { logger as _logger } from "../logger";
import { updateGeneratedLlmsTxt } from "./generate-llmstxt-redis";
import { mapController } from "../../controllers/v1/map";
import { scrapeController } from "../../controllers/v1/scrape";
import { MapResponse, ScrapeResponse, Document } from "../../controllers/v1/types";
import { Response } from "express";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

interface GenerateLLMsTextServiceOptions {
  generationId: string;
  teamId: string;
  plan: string;
  url: string;
  maxUrls: number;
  showFullText: boolean;
}

function createExpressResponse<T>(): Response {
  const res = {} as Response;
  res.status = () => res;
  res.json = (data: T) => data as any;
  res.send = () => res;
  res.sendStatus = () => res;
  res.links = () => res;
  res.jsonp = () => res;
  res.sendFile = () => res;
  return res;
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
  });

  try {
    // First, get all URLs from the map controller
    const mockMapReq = {
      auth: { team_id: teamId, plan },
      body: { url, limit: maxUrls, includeSubdomains: false },
    };

   
    const mapResult = await mapController(mockMapReq as any, createExpressResponse<MapResponse>());
    const mapResponse = mapResult as unknown as MapResponse;

    if (!mapResponse.success) {
      throw new Error(`Failed to map URLs: ${mapResponse.error}`);
    }

    _logger.debug("Mapping URLs", mapResponse.links);

    const urls = mapResponse.links;
    let llmstxt = `# ${url} llms.txt\n\n`;
    let llmsFulltxt = `# ${url} llms-full.txt\n\n`;


    // Scrape each URL
    for (const url of urls) {
      const mockScrapeReq = {
        auth: { team_id: teamId, plan },
        body: {
          url,
          formats: ["markdown"],
          onlyMainContent: true,
        },
      };

      _logger.debug(`Scraping URL: ${url}`);
      const scrapeResult = await scrapeController(mockScrapeReq as any, createExpressResponse<ScrapeResponse>());
      const scrapeResponse = scrapeResult as unknown as ScrapeResponse;

      if (!scrapeResponse.success) {
        logger.error(`Failed to scrape URL ${url}: ${scrapeResponse.error}`);
        continue;
      }

      // Process scraped result
      const document = Array.isArray(scrapeResponse.data) ? scrapeResponse.data[0] : scrapeResponse.data;
      
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
        logger.error(`Failed to parse LLM response for ${document.metadata?.url}:`, error);
        continue;
      }
    }

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
    logger.error("Generate LLMs text error:", error);

    await updateGeneratedLlmsTxt(generationId, {
      status: "failed",
      error: error.message || "Unknown error occurred",
    });

    throw error;
  }
} 