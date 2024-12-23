import axios from "axios";
import { axiosTimeout } from "../../lib/timeout";
import { parseStringPromise } from "xml2js";
import { WebCrawler } from "./crawler";
import { scrapeURL } from "../scrapeURL";
import { scrapeOptions } from "../../controllers/v1/types";
import type { Logger } from "winston";

export async function getLinksFromSitemap(
  {
    sitemapUrl,
    urlsHandler,
    mode = "axios",
  }: {
    sitemapUrl: string;
    urlsHandler(urls: string[]): unknown,
    mode?: "axios" | "fire-engine";
  },
  logger: Logger,
): Promise<number> {
  try {
    let content: string = "";
    try {
      if (mode === "axios" || process.env.FIRE_ENGINE_BETA_URL === "") {
        const response = await axios.get(sitemapUrl, { timeout: axiosTimeout });
        content = response.data;
      } else if (mode === "fire-engine") {
        const response = await scrapeURL(
          "sitemap",
          sitemapUrl,
          scrapeOptions.parse({ formats: ["rawHtml"] }),
          { forceEngine: "fire-engine;tlsclient", v0DisableJsDom: true },
        );
        if (!response.success) {
          throw response.error;
        }
        content = response.document.rawHtml!;
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
      const sitemapPromises: Promise<number>[] = root.sitemap
        .filter((sitemap) => sitemap.loc && sitemap.loc.length > 0)
        .map((sitemap) =>
          getLinksFromSitemap(
            { sitemapUrl: sitemap.loc[0], urlsHandler, mode },
            logger,
          ),
        );
      count += (await Promise.all(sitemapPromises)).reduce((a,x) => a + x, 0);
    } else if (root && root.url) {
      const validUrls = root.url
        .filter(
          (url) =>
            url.loc &&
            url.loc.length > 0 &&
            !WebCrawler.prototype.isFile(url.loc[0]),
        )
        .map((url) => url.loc[0]);
      count += validUrls.length;
      urlsHandler(validUrls);
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
