import { z } from "zod";
import { logger } from "../../../lib/logger";
import { robustFetch } from "./fetch";

// Define schemas outside the function scope
const tokenUsageDetailSchema = z.object({
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  total_cost: z.number().nullable(), // Allows number or null
});

// Schema for an individual scraped page object
const scrapedPageSchema = z.object({
  html: z.string(),
  reason: z.string(),
  page: z.number().int(),
});

// Main schema for the structure returned by the smart-scrape endpoint
const smartScrapeResultSchema = z.object({
  sessionId: z.string(),
  success: z.boolean(),
  scrapedPages: z.array(scrapedPageSchema),
  tokenUsage: z.record(
    z.string(), // Key is the model name (string)
    tokenUsageDetailSchema, // Value matches the detail schema
  ),
});

// Infer the TypeScript type from the Zod schema
type SmartScrapeResult = z.infer<typeof smartScrapeResultSchema>;

/**
 * Sends a POST request to the internal /smart-scrape endpoint to extract
 * structured data from a URL based on a prompt.
 *
 * @param url The URL of the page to scrape.
 * @param prompt The prompt guiding the data extraction.
 * @returns A promise that resolves to an object matching the SmartScrapeResult type.
 * @throws Throws an error if the request fails or the response is invalid.
 */
export async function smartScrape(
  url: string,
  prompt: string,
): Promise<SmartScrapeResult> {
  try {
    logger.info("Initiating smart scrape request", { url, prompt });

    // Pass schema type as generic parameter to robustFetch
    const response = await robustFetch<typeof smartScrapeResultSchema>({
      url: `${process.env.SMART_SCRAPE_API_URL}/smart-scrape`,
      method: "POST",
      body: {
        url,
        prompt,
        thinkingModel: {
          model: "gemini-2.5-pro-exp-03-25",
          provider: "google",
          supportTools: true,
          toolChoice: "required",
          cost: {
            input: 1.3,
            output: 5,
          },
        },
        toolModel: {
          model: "gemini-2.0-flash",
          provider: "google",
        },
      },
      schema: smartScrapeResultSchema, // Pass the schema instance for validation
      logger,
      mock: null, // Keep mock null if not mocking
    });

    logger.info("Smart scrape successful", {
      url,
      prompt,
      sessionId: response.sessionId,
    });
    return response; // The response type now matches SmartScrapeResult
  } catch (error) {
    logger.error("Smart scrape request failed", { url, prompt, error });
    // Rethrowing the error to be handled by the caller
    // Consider more specific error handling or wrapping if needed
    throw new Error(`Failed to smart scrape URL: ${url}`, { cause: error });
  }
}
