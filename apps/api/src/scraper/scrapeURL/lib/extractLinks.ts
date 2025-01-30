// TODO: refactor
import { load } from "cheerio"; // rustified
import { logger } from "../../../lib/logger";
import { extractLinks as _extractLinks } from "../../../lib/html-transformer";

async function extractLinksRust(html: string, baseUrl: string): Promise<string[]> {
  const hrefs = await _extractLinks(html);

  const links: string[] = [];

  hrefs.forEach(href => {
    href = href.trim();
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
  });

  // Remove duplicates and return
  return [...new Set(links)];
}

export async function extractLinks(html: string, baseUrl: string): Promise<string[]> {
  try {
    return await extractLinksRust(html, baseUrl);
  } catch (error) {
    logger.error("Failed to call html-transformer! Falling back to cheerio...", {
      error,
      module: "scrapeURL", method: "extractLinks"
    });
  }

  const $ = load(html);
  const links: string[] = [];

  $("a").each((_, element) => {
    let href = $(element).attr("href");
    if (href) {
      href = href.trim();
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
