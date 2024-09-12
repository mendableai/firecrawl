/**
 * Error class for Firecrawl API errors.
 * 
 * @example
 * ```ts
 * try {
 *   const response = await firecrawl.scrapeUrl("https://example.com");
 * } catch (error) {
 *   if (error instanceof FirecrawlApiError) {
 *     console.error("Firecrawl API error:", error.message);
 *     console.error("Request:", error.request);
 *     console.error("Response:", error.response);
 *   }
 * ```
 */
export class FirecrawlApiError extends Error {
  public request: Request;
  public response: Response;

  constructor(message: string, request: Request, response: Response) {
    super(message);
    this.request = request;
    this.response = response;
  }
}