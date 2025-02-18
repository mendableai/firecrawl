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
  maxTokens: number;
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
  const { generationId, teamId, plan, url, maxTokens } = options;
  const logger = _logger.child({
    module: "generate-llmstxt",
    method: "performGenerateLlmsTxt",
    generationId,
  });

  try {
    // First, get all URLs from the map controller
    const mockMapReq = {
      auth: { team_id: teamId, plan },
      body: { url },
    };

    _logger.debug("Getting URLs from map controller");
    const mapResult = await mapController(mockMapReq as any, createExpressResponse<MapResponse>());
    const mapResponse = mapResult as unknown as MapResponse;

    if (!mapResponse.success) {
      throw new Error(`Failed to map URLs: ${mapResponse.error}`);
    }

    const urls = mapResponse.links;
    let llmstxt = "";
    let llmsFulltxt = "";

    // Scrape each URL
    const mockScrapeReq = {
      auth: { team_id: teamId, plan },
      body: {
        urls,
        formats: ["markdown"],
        onlyMainContent: true,
      },
    };

    _logger.debug("Scraping URLs");
    const scrapeResult = await scrapeController(mockScrapeReq as any, createExpressResponse<ScrapeResponse>());
    const scrapeResponse = scrapeResult as unknown as ScrapeResponse;

    if (!scrapeResponse.success) {
      throw new Error(`Failed to scrape URLs: ${scrapeResponse.error}`);
    }

    // Process each scraped result
    const documents = Array.isArray(scrapeResponse.data) ? scrapeResponse.data : [scrapeResponse.data];

    for (let i = 0; i < documents.length; i++) {
      const result = documents[i];
      if (!result.markdown) continue;

      _logger.debug(`Generating description for ${result.metadata?.url}`);
      
      const completion = await openai.beta.chat.completions.parse({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user", 
            content: `Generate a 9-10 word description and a 3-4 word title of the entire page based on ALL the content one will find on the page for this url: ${result.metadata?.url}. This will help in a user finding the page for its intended purpose. Here is the content: ${result.markdown}`
          }
        ],
        response_format: zodResponseFormat(DescriptionSchema, "description")
      });

      
      try {
        

        const parsedResponse = completion.choices[0].message.parsed;
        const description = parsedResponse!.description;
        const title = parsedResponse!.title;

        
        llmstxt += `- [${title}](${result.metadata?.url}): ${description}\n`;
        llmsFulltxt += `## ${title}\n${result.markdown}\n\n`;

        // Update progress with both generated text and full text
        await updateGeneratedLlmsTxt(generationId, {
          status: "processing",
          generatedText: llmstxt,
          fullText: llmsFulltxt,
        });
      } catch (error) {
        logger.error(`Failed to parse LLM response for ${result.metadata?.url}:`, error);
        continue;
      }
    }

    // Update final result with both generated text and full text
    await updateGeneratedLlmsTxt(generationId, {
      status: "completed",
      generatedText: llmstxt,
      fullText: llmsFulltxt,
    });

    return {
      success: true,
      data: {
        generatedText: llmstxt,
        fullText: llmsFulltxt,
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