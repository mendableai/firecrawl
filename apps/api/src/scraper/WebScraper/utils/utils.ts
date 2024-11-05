import axios from "axios";
import * as cheerio from "cheerio";
import { Logger } from "../../../lib/logger";

export async function attemptScrapWithRequests(
  urlToScrap: string
): Promise<string | null> {
  try {
    const response = await axios.get(urlToScrap, { timeout: 60000 });

    if (!response.data) {
      Logger.debug("Failed normal requests as well");
      return null;
    }

    return response.data;
  } catch (error) {
    Logger.debug(`Error in attemptScrapWithRequests: ${error}`);
    return null;
  }
}

export function sanitizeText(text: string): string {
  return text.replace("\u0000", "");
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $("a").each((_, element) => {
    let href = $(element).attr("href");
    if (href) {
      if (href.startsWith("/")) {
        // Relative URL starting with '/', append to origin
        href = new URL(href, baseUrl).href;
      } else if (!href.startsWith("#") && !href.startsWith("mailto:")) {
        // Relative URL not starting with '/', append to base URL
        href = new URL(href, baseUrl).href;
      }
    }

    links.push(href);
  });

  const dedupedLinks = [...new Set(links)];

  Logger.debug(
    `extractLinks extracted ${dedupedLinks.length} links from ${baseUrl}`
  );

  return dedupedLinks;
}
