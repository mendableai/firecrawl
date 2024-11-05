import axios from "axios";
import * as cheerio from "cheerio";
import { Logger } from "../../../lib/logger";


export async function attemptScrapWithRequests(
  urlToScrap: string
): Promise<string | null> {
  try {
    const response = await axios.get(urlToScrap, { timeout: 15000 });

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

  $('a').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      try {
        if (href.startsWith('http://') || href.startsWith('https://')) {
          // Absolute URL, add as is
          links.push(href);
        } else if (href.startsWith('/')) {
          // Relative URL starting with '/', append to base URL
          links.push(new URL(href, baseUrl).href);
        } else if (!href.startsWith('#') && !href.startsWith('mailto:')) {
          // Relative URL not starting with '/', append to base URL
          links.push(new URL(href, baseUrl).href);
        } else if (href.startsWith('mailto:')) {
          // mailto: links, add as is
          links.push(href);
        }
        // Fragment-only links (#) are ignored
      } catch (error) {
        // Log the error and continue
        console.error(`Failed to construct URL for href: ${href} with base: ${baseUrl}`, error);
      }
    }
  });

  // Remove duplicates and return
  return [...new Set(links)];
}