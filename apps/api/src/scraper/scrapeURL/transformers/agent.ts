import {
  Document,
} from "../../../controllers/v1/types";
import { Meta } from "..";
import { logger } from "../../../lib/logger";
import { parseMarkdown } from "../../../lib/html-to-markdown";
import { smartScrape } from "../lib/smartScrape";


export async function performAgent(
  meta: Meta,
  document: Document,
): Promise<Document> {
  // TODO: add token usage!!!!

  if (meta.options.agent?.prompt) {
    const url: string | undefined = document.url || document.metadata.sourceURL

    if (!url) {
      logger.error("document.url or document.metadata.sourceURL is undefined -- this is unexpected");
      // throw new Error("document.url or document.metadata.sourceURL is undefined -- this is unexpected");
      return document;
    }

    const prompt = meta.options.agent?.prompt ?? undefined
    const sessionId = meta.options.agent?.sessionId ?? undefined
    let smartscrapeResults = await smartScrape(url, prompt, sessionId)

    const html = smartscrapeResults.scrapedPages[smartscrapeResults.scrapedPages.length - 1].html

    if (meta.options.formats.includes("markdown")) {
      const markdown = await parseMarkdown(html)
      document.markdown = markdown
    }
    if (meta.options.formats.includes("html")) {
      document.html = html
    }
  }

  return document;
}
