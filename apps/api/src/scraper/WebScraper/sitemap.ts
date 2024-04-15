import axios from "axios";
import { parseStringPromise } from "xml2js";

export async function getLinksFromSitemap(
  sitemapUrl: string,
  allUrls: string[] = []
): Promise<string[]> {
  try {
    let content: string;
    try {
      const response = await axios.get(sitemapUrl);
      content = response.data;
    } catch (error) {
      console.error(`Request failed for ${sitemapUrl}: ${error}`);
      return allUrls;
    }

    const parsed = await parseStringPromise(content);
    const root = parsed.urlset || parsed.sitemapindex;

    if (root && root.sitemap) {
      for (const sitemap of root.sitemap) {
        if (sitemap.loc && sitemap.loc.length > 0) {
          await getLinksFromSitemap(sitemap.loc[0], allUrls);
        }
      }
    } else if (root && root.url) {
      for (const url of root.url) {
        if (url.loc && url.loc.length > 0) {
          allUrls.push(url.loc[0]);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing ${sitemapUrl}: ${error}`);
  }

  return allUrls;
}

export const fetchSitemapData = async (url: string): Promise<SitemapEntry[] | null> => {
  const sitemapUrl = url.endsWith("/sitemap.xml") ? url : `${url}/sitemap.xml`;
  try {
    const response = await axios.get(sitemapUrl);
    if (response.status === 200) {
      const xml = response.data;
      const parsedXml = await parseStringPromise(xml);

      const sitemapData: SitemapEntry[] = [];
      if (parsedXml.urlset && parsedXml.urlset.url) {
        for (const urlElement of parsedXml.urlset.url) {
          const sitemapEntry: SitemapEntry = { loc: urlElement.loc[0] };
          if (urlElement.lastmod) sitemapEntry.lastmod = urlElement.lastmod[0];
          if (urlElement.changefreq) sitemapEntry.changefreq = urlElement.changefreq[0];
          if (urlElement.priority) sitemapEntry.priority = Number(urlElement.priority[0]);
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
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}