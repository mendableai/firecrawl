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

dotenv.config();

const app = express();
const port = process.env.PORT || 3003;

app.use(bodyParser.json());

const PROXY_SERVER = process.env.PROXY_SERVER || null;
const PROXY_USERNAME = process.env.PROXY_USERNAME || null;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || null;
const TWOCAPTCHA_TOKEN = process.env.TWOCAPTCHA_TOKEN || null;

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
    maxConcurrency: 2,
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

app.post("/scrape", async (req: Request, res: Response) => {
  const {
    url,
    wait_after_load = 0,
    timeout = 15000,
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
      const { url, timeout = 15000, headers, check_selector }: UrlModel = data;

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
    console.log(`✅ Scrape successful!`);
  } else {
    console.log(
      `🚨 Scrape failed with status code: ${pageStatusCode} ${pageError}`
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
