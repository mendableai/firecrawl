// TODO: refactor
import { load } from "cheerio";
import { logger } from "../../../lib/logger";

export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = load(html);
  const links: string[] = [];

  $("a").each((_, element) => {
    const href = $(element).attr("href");
    if (href) {
      try {
        if (href.startsWith("http://") || href.startsWith("https://")) {
          // Absolute URL, add as is
          links.push(href);
        } else if (href.startsWith("/")) {
          // Relative URL starting with '/', append to origin
          links.push(new URL(href, baseUrl).href);
        } else if (!href.startsWith("#") && !href.startsWith("mailto:")) {
          // Relative URL not starting with '/', append to base URL
          links.push(new URL(href, baseUrl).href);
        } else if (href.startsWith("mailto:")) {
          // mailto: links, add as is
          links.push(href);
        }
        // Fragment-only links (#) are ignored
      } catch (error) {
        logger.error(
          `Failed to construct URL for href: ${href} with base: ${baseUrl}`,
          { error },
        );
      }
    }
  });

  // Remove duplicates and return
  return [...new Set(links)];
}
