import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { getError } from "./helpers/get_error";
import { Cluster } from "puppeteer-cluster";
import vanillaPuppeteer, { PuppeteerNodeLaunchOptions } from "puppeteer";
import { addExtra } from "puppeteer-extra";
import Stealth from "puppeteer-extra-plugin-stealth";
import Recaptcha from "puppeteer-extra-plugin-recaptcha";
import AdBlocker from "puppeteer-extra-plugin-adblocker";
import { setupOpenAPI } from "./openapi";

dotenv.config();

const app = express();
const port = process.env.PORT || 3003;

setupOpenAPI(app);

app.use(bodyParser.json());

const PROXY_SERVER = process.env.PROXY_SERVER || null;
const PROXY_USERNAME = process.env.PROXY_USERNAME || null;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || null;
const TWOCAPTCHA_TOKEN = process.env.TWOCAPTCHA_TOKEN || null;
const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY) || 2;

interface UrlModel {
  url: string;
  wait_after_load?: number;
  timeout?: number;
  headers?: { [key: string]: string };
  check_selector?: string;
}

let cluster: Cluster;

const initializeBrowser = async () => {
  const puppeteer = addExtra(vanillaPuppeteer);
  puppeteer.use(Stealth());
  puppeteer.use(AdBlocker());

  if (TWOCAPTCHA_TOKEN) {
    puppeteer.use(
      Recaptcha({
        provider: {
          id: "2captcha",
          token: TWOCAPTCHA_TOKEN,
        },
        visualFeedback: true,
      })
    );
  }

  let puppeteerOptions: PuppeteerNodeLaunchOptions = {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };
  if (PROXY_SERVER && PROXY_USERNAME && PROXY_PASSWORD) {
    puppeteerOptions.args?.push(`--proxy-server=${PROXY_SERVER}`);
  }

  cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: MAX_CONCURRENCY,
    puppeteerOptions,
    puppeteer,
  });
};

const shutdownBrowser = async () => {
  cluster.close();
};

const isValidUrl = (urlString: string): boolean => {
  try {
    new URL(urlString);
    return true;
  } catch (_) {
    return false;
  }
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

  console.log(`================= Scrape Request =================`);
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

  if (!cluster) {
    await initializeBrowser();
  }

  let pageContent;
  let pageStatusCode: number | null = null;

  await cluster.task(
    async ({ page, data }: { page: any; data: UrlModel }): Promise<void> => {
      const { url, timeout = 60000, headers, check_selector }: UrlModel = data;

      if (PROXY_USERNAME && PROXY_PASSWORD) {
        await page.authenticate({
          username: PROXY_USERNAME,
          password: PROXY_PASSWORD,
        });
      }

      if (headers) {
        await page.setExtraHTTPHeaders(headers);
      }

      const loadResponse = await page.goto(url, { waitUntil: "load", timeout });

      if (check_selector) {
        try {
          await page.waitForSelector(check_selector, { timeout });
        } catch (error) {
          throw new Error("Required selector not found");
        }
      }

      pageContent = await page.content();
      pageStatusCode = loadResponse ? loadResponse.status() : null;

      if (!pageContent) {
        console.log("Load strategy failed, trying networkidle2");
        const loadResponse = await page.goto(url, {
          waitUntil: "networkidle2",
          timeout,
        });

        if (check_selector) {
          try {
            await page.waitForSelector(check_selector, { timeout });
          } catch (error) {
            throw new Error("Required selector not found");
          }
        }

        pageContent = await page.content();
        pageStatusCode = loadResponse ? loadResponse.status() : null;
      }

      await page.close();
    }
  );

  try {
    await cluster.execute(req.body);
  } catch (err) {
    console.error(
      "Failed to execute following URL with cluster:",
      url,
      "error: ",
      err
    );
  }

  const pageError = pageStatusCode !== 200 ? getError(pageStatusCode) : false;

  if (!pageError) {
    console.log(`✅ Scrape of ${url} successful!`);
  } else {
    console.log(
      `🚨 Scrape of ${url} failed with status code: ${pageStatusCode} ${pageError}`
    );
  }

  res.json({
    content: pageContent,
    pageStatusCode,
    pageError,
  });
});

app.listen(port, () => {
  initializeBrowser().then(() => {
    console.log(`Server is running on port ${port}`);
  });
});

process.on("SIGINT", () => {
  shutdownBrowser().then(() => {
    console.log("Browser closed");
    process.exit(0);
  });
});
