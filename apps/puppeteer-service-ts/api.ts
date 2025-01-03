import express from "express";
import type { Request, Response } from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import Hero, { Resource, WebsocketResource } from "@ulixee/hero";
import HeroCore from "@ulixee/hero-core";
import { TransportBridge } from "@ulixee/net";
import { ConnectionToHeroCore } from "@ulixee/hero";
import { getError } from "./helpers/get_error";
import { setupOpenAPI } from "./openapi";

dotenv.config();

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3003;

let heroCore: HeroCore;
let connectionToCore: ConnectionToHeroCore;

setupOpenAPI(app);

app.use(bodyParser.json());

interface UrlModel {
  url: string;
  wait_after_load?: number;
  timeout?: number;
  headers?: { [key: string]: string };
  check_selector?: string;
}

const isValidUrl = (urlString: string): boolean => {
  try {
    new URL(urlString);
    return true;
  } catch (_) {
    return false;
  }
};

const initializeHeroCore = async () => {
  const bridge = new TransportBridge();
  connectionToCore = new ConnectionToHeroCore(bridge.transportToCore);

  heroCore = new HeroCore();
  heroCore.addConnection(bridge.transportToClient);
};

const scrape = async (
  url: string,
  wait_after_load: number,
  timeout: number,
  headers?: { [key: string]: string },
  check_selector?: string,
  proxy_url?: string,
) => {
  const heroInstance = new Hero({
    connectionToCore,
    userAgent:
      headers?.["User-Agent"] ||
      "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/109.0",
    upstreamProxyUrl: proxy_url,
    upstreamProxyUseLocalDns: true,
  });

  const tab = heroInstance.activeTab;

  if (proxy_url) {
    console.log(`Using proxy: ${proxy_url}`);
  }

  if (headers) {
    tab.on("resource", (resource: Resource | WebsocketResource) => {
      if ("request" in resource && "headers" in resource.request) {
        Object.entries(headers).forEach(([key, value]) => {
          if (typeof value === "string") {
            resource.request.headers[key] = value;
          }
        });
      }
    });
  }

  // Wait for navigation to complete and get response
  const resource = await tab.goto(url, {
    timeoutMs: timeout,
  });

  const pageStatusCode = resource.response.statusCode;

  // Wait for page to be stable first
  await tab.waitForPaintingStable();

  // Check for required selector if specified
  if (check_selector) {
    await tab.waitForElement(tab.querySelector(check_selector), {
      timeoutMs: timeout,
    });
  }

  // Wait additional time if specified
  if (wait_after_load > 0) {
    await tab.waitForMillis(wait_after_load);
  }

  // Get the page content
  const documentElement = await tab.document.documentElement;
  const pageContent = await documentElement.innerHTML;
  if (!pageContent) {
    throw new Error("Failed to get page content");
  }

  heroInstance.close().catch(console.error);

  return { pageContent, pageStatusCode };
};

/**
 * @openapi
 * components:
 *   schemas:
 *     ScrapeRequest:
 *       type: object
 *       required:
 *         - url
 *       properties:
 *         url:
 *           type: string
 *           format: uri
 *           description: The URL to scrape
 *         wait_after_load:
 *           type: integer
 *           default: 0
 *           description: Time to wait after page load in milliseconds
 *         timeout:
 *           type: integer
 *           default: 60000
 *           description: Maximum time to wait for page load in milliseconds
 *         headers:
 *           type: object
 *           additionalProperties:
 *             type: string
 *           description: Custom HTTP headers to send with request
 *         check_selector:
 *           type: string
 *           description: CSS selector to wait for before considering page loaded
 *
 *     ScrapeResponse:
 *       type: object
 *       properties:
 *         content:
 *           type: string
 *           description: The HTML content of the page
 *         pageStatusCode:
 *           type: integer
 *           description: HTTP status code of the response
 *         pageError:
 *           type: string
 *           nullable: true
 *           description: Error message if any occurred
 *
 * /scrape:
 *   post:
 *     tags:
 *       - Scraping
 *     summary: Scrape a webpage using Puppeteer
 *     description: |
 *       Scrapes a webpage using Puppeteer with support for:
 *       - Custom wait times
 *       - Custom headers
 *       - Selector checks
 *       - Proxy support
 *       - Recaptcha handling
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ScrapeRequest'
 *     responses:
 *       200:
 *         description: Successfully scraped webpage
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ScrapeResponse'
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       408:
 *         description: Request timeout
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
app.post("/scrape", async (req: Request, res: Response) => {
  const {
    url,
    wait_after_load = 0,
    timeout = 60000,
    headers,
    check_selector,
  }: UrlModel = req.body;

  console.log(`\n================= Scrape Request =================`);
  console.log(`URL: ${url}`);
  console.log(`Wait After Load: ${wait_after_load}`);
  console.log(`Timeout: ${timeout}`);
  console.log(`Headers: ${headers ? JSON.stringify(headers) : "None"}`);
  console.log(`Check Selector: ${check_selector ? check_selector : "None"}`);
  console.log(`==================================================`);

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  if (!isValidUrl(url)) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  let pageContent: string | null = null;
  let pageStatusCode: number | null = null;
  const startTime = Date.now();

  const attemptScrape = async () => {
    try {
      return await scrape(
        url,
        wait_after_load,
        timeout,
        headers,
        check_selector,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Failed to get page content"
      ) {
        console.log("Retrying scrape due to failed page content...");
        let proxy_url = process.env.PROXY_URL;
        return await scrape(
          url,
          wait_after_load,
          timeout,
          headers,
          check_selector,
          proxy_url,
        );
      }
      throw error;
    }
  };

  try {
    ({ pageContent, pageStatusCode } = await attemptScrape());
  } catch (error) {
    console.error("Scraping error:", error);
    return res.status(500).json({
      error: "Failed to scrape the page",
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const errorMessage = getError(pageStatusCode);
  const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);

  // Log success/failure based on error message
  if (!errorMessage) {
    console.log(`✅ Scrape of ${url} successful! (${executionTime}s)`);
  } else {
    console.log(
      `🚨 Scrape of ${url} failed: ${pageStatusCode} - ${errorMessage}`,
    );
  }

  res.json({
    content: pageContent,
    pageStatusCode,
    pageError: errorMessage,
  });
});

app.get("/health", async (_req: Request, res: Response) => {
  try {
    if (!heroCore) {
      return res.status(503).json({
        status: "error",
        message: "Hero Core not initialized",
      });
    }
    res.json({ status: "ok" });
  } catch (error) {
    res.status(503).json({
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

const shutdown = async () => {
  console.log("\nShutting down server...");

  try {
    await HeroCore.shutdown();
    console.log("Hero Core shut down successfully");
  } catch (error) {
    console.error("Error during shutdown:", error);
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

(async () => {
  await initializeHeroCore();

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
})().catch(console.error);

export default app;
