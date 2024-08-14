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

  // Parse the base URL to get the origin
  const urlObject = new URL(baseUrl);
  const origin = urlObject.origin;

  $('a').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      if (href.startsWith('http://') || href.startsWith('https://')) {
        // Absolute URL, add as is
        links.push(href);
      } else if (href.startsWith('/')) {
        // Relative URL starting with '/', append to origin
        links.push(`${origin}${href}`);
      } else if (!href.startsWith('#') && !href.startsWith('mailto:')) {
        // Relative URL not starting with '/', append to base URL
        links.push(`${baseUrl}/${href}`);
      } else if (href.startsWith('mailto:')) {
        // mailto: links, add as is
        links.push(href);
      }
      // Fragment-only links (#) are ignored
    }
  });

  // Remove duplicates and return
  return [...new Set(links)];
}