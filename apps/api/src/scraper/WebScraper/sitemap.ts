import axios from "axios";
import { axiosTimeout } from "../../lib/timeout";
import { parseStringPromise } from "xml2js";
import { WebCrawler } from "./crawler";
import { scrapeURL } from "../scrapeURL";
import { scrapeOptions } from "../../controllers/v1/types";
import type { Logger } from "winston";
const useFireEngine =
  process.env.FIRE_ENGINE_BETA_URL !== "" &&
  process.env.FIRE_ENGINE_BETA_URL !== undefined;
export async function getLinksFromSitemap(
  {
    sitemapUrl,
    urlsHandler,
    mode = "axios",
  }: {
    sitemapUrl: string;
    urlsHandler(urls: string[]): unknown;
    mode?: "axios" | "fire-engine";
  },
  logger: Logger,
): Promise<number> {
  try {
    let content: string = "";
    try {
      if (mode === "fire-engine" && useFireEngine) {
        const response = await scrapeURL(
          "sitemap",
          sitemapUrl,
          scrapeOptions.parse({ formats: ["rawHtml"] }),
          { forceEngine: "fire-engine;tlsclient", v0DisableJsDom: true },
        );
        if (!response.success) {
          logger.debug(
            "Failed to scrape sitemap via TLSClient, falling back to axios...",
            { error: response.error },
          );
          const ar = await axios.get(sitemapUrl, { timeout: axiosTimeout });
          content = ar.data;
        } else {
          content = response.document.rawHtml!;
        }
      } else {
        const response = await axios.get(sitemapUrl, { timeout: axiosTimeout });
        content = response.data;
      }
    } catch (error) {
      logger.error(`Request failed for ${sitemapUrl}`, {
        method: "getLinksFromSitemap",
        mode,
        sitemapUrl,
        error,
      });

      return 0;
    }

    const parsed = await parseStringPromise(content);
    const root = parsed.urlset || parsed.sitemapindex;
    let count = 0;

    if (root && root.sitemap) {
      // Handle sitemap index files
      const sitemapUrls = root.sitemap
        .filter((sitemap) => sitemap.loc && sitemap.loc.length > 0)
        .map((sitemap) => sitemap.loc[0].trim());

      const sitemapPromises: Promise<number>[] = sitemapUrls.map((sitemapUrl) =>
        getLinksFromSitemap({ sitemapUrl, urlsHandler, mode }, logger),
      );

      const results = await Promise.all(sitemapPromises);
      count = results.reduce((a, x) => a + x);
    } else if (root && root.url) {
      // Check if any URLs point to additional sitemaps
      const xmlSitemaps: string[] = root.url
        .filter(
          (url) =>
            url.loc &&
            url.loc.length > 0 &&
            url.loc[0].trim().toLowerCase().endsWith(".xml"),
        )
        .map((url) => url.loc[0].trim());

      if (xmlSitemaps.length > 0) {
        // Recursively fetch links from additional sitemaps
        const sitemapPromises = xmlSitemaps.map((sitemapUrl) =>
          getLinksFromSitemap(
            { sitemapUrl: sitemapUrl, urlsHandler, mode },
            logger,
          ),
        );
        count += (await Promise.all(sitemapPromises)).reduce(
          (a, x) => a + x,
          0,
        );
      }

      const validUrls = root.url
        .filter(
          (url) =>
            url.loc &&
            url.loc.length > 0 &&
            !url.loc[0].trim().toLowerCase().endsWith(".xml") &&
            !WebCrawler.prototype.isFile(url.loc[0].trim()),
        )
        .map((url) => url.loc[0].trim());
      count += validUrls.length;

      const h = urlsHandler(validUrls);
      if (h instanceof Promise) {
        await h;
      }
    }

    return count;
  } catch (error) {
    logger.debug(`Error processing sitemapUrl: ${sitemapUrl}`, {
      method: "getLinksFromSitemap",
      mode,
      sitemapUrl,
      error,
    });
  }

  return 0;
}

export const fetchSitemapData = async (
  url: string,
  timeout?: number,
): Promise<SitemapEntry[] | null> => {
  const sitemapUrl = url.endsWith("/sitemap.xml") ? url : `${url}/sitemap.xml`;
  try {
    const response = await axios.get(sitemapUrl, {
      timeout: timeout || axiosTimeout,
    });
    if (response.status === 200) {
      const xml = response.data;
      const parsedXml = await parseStringPromise(xml);

      const sitemapData: SitemapEntry[] = [];
      if (parsedXml.urlset && parsedXml.urlset.url) {
        for (const urlElement of parsedXml.urlset.url) {
          const sitemapEntry: SitemapEntry = { loc: urlElement.loc[0] };
          if (urlElement.lastmod) sitemapEntry.lastmod = urlElement.lastmod[0];
          if (urlElement.changefreq)
            sitemapEntry.changefreq = urlElement.changefreq[0];
          if (urlElement.priority)
            sitemapEntry.priority = Number(urlElement.priority[0]);
          sitemapData.push(sitemapEntry);
        }
      }

      return sitemapData;
    }
    return null;
  } catch (error) {
    // Error handling for failed sitemap fetch
  }
  return [];
};

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}
