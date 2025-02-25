import { MapDocument, URLTrace } from "../../controllers/v1/types";
import { getMapResults } from "../../controllers/v1/map";
import { PlanType } from "../../types";
import { removeDuplicateUrls } from "../validateUrl";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist";
import { buildPreRerankPrompt, buildRefrasedPrompt} from "./build-prompts";
import { rerankLinksWithLLM } from "./reranker";
import { extractConfig } from "./config";
import type { Logger } from "winston";
import { generateText } from "ai";
import { getModel } from "../generic-ai";
import { generateCompletions } from "../../scraper/scrapeURL/transformers/llmExtract";

export async function generateBasicCompletion(prompt: string) {
  const { text } = await generateText({
    model: getModel("gpt-4o"),
    prompt: prompt,
    temperature: 0
  });
  return text;
}
interface ProcessUrlOptions {
  url: string;
  prompt?: string;
  schema?: any;
  teamId: string;
  plan: PlanType;
  allowExternalLinks?: boolean;
  origin?: string;
  limit?: number;
  includeSubdomains?: boolean;
}

export async function processUrl(
  options: ProcessUrlOptions,
  urlTraces: URLTrace[],
  updateExtractCallback: (links: string[]) => void,
  logger: Logger,
): Promise<string[]> {
  const trace: URLTrace = {
    url: options.url,
    status: "mapped",
    timing: {
      discoveredAt: new Date().toISOString(),
    },
  };
  urlTraces.push(trace);

  if (!options.url.includes("/*") && !options.allowExternalLinks) {
    if (!isUrlBlocked(options.url)) {
      trace.usedInCompletion = true;
      return [options.url];
    }
    logger.warn("URL is blocked");
    trace.status = "error";
    trace.error = "URL is blocked";
    trace.usedInCompletion = false;
    return [];
  }

  const baseUrl = options.url.replace("/*", "");
  let urlWithoutWww = baseUrl.replace("www.", "");

  let searchQuery = options.prompt;
  if (options.prompt) {
    searchQuery =
      (
        await generateBasicCompletion(
          buildRefrasedPrompt(options.prompt, baseUrl),
        )
      )
        ?.replace('"', "")
        .replace("/", "") ?? options.prompt;
  }

  try {
    logger.debug("Running map...", {
      search: searchQuery,
    });
    const mapResults = await getMapResults({
      url: baseUrl,
      search: searchQuery,
      teamId: options.teamId,
      plan: options.plan,
      allowExternalLinks: options.allowExternalLinks,
      origin: options.origin,
      limit: options.limit,
      ignoreSitemap: false,
      includeMetadata: true,
      includeSubdomains: options.includeSubdomains,
    });

    let mappedLinks = mapResults.mapResults as MapDocument[];
    let allUrls = [...mappedLinks.map((m) => m.url), ...mapResults.links];
    let uniqueUrls = removeDuplicateUrls(allUrls);
    logger.debug("Map finished.", {
      linkCount: allUrls.length,
      uniqueLinkCount: uniqueUrls.length,
    });

    // Track all discovered URLs
    uniqueUrls.forEach((discoveredUrl) => {
      if (!urlTraces.some((t) => t.url === discoveredUrl)) {
        urlTraces.push({
          url: discoveredUrl,
          status: "mapped",
          timing: {
            discoveredAt: new Date().toISOString(),
          },
          usedInCompletion: false,
        });
      }
    });

    // retry if only one url is returned
    if (uniqueUrls.length <= 1) {
      logger.debug("Running map... (pass 2)");
      const retryMapResults = await getMapResults({
        url: baseUrl,
        teamId: options.teamId,
        plan: options.plan,
        allowExternalLinks: options.allowExternalLinks,
        origin: options.origin,
        limit: options.limit,
        ignoreSitemap: false,
        includeMetadata: true,
        includeSubdomains: options.includeSubdomains,
      });

      mappedLinks = retryMapResults.mapResults as MapDocument[];
      allUrls = [...mappedLinks.map((m) => m.url), ...mapResults.links];
      uniqueUrls = removeDuplicateUrls(allUrls);
      logger.debug("Map finished. (pass 2)", {
        linkCount: allUrls.length,
        uniqueLinkCount: uniqueUrls.length,
      });

      // Track all discovered URLs
      uniqueUrls.forEach((discoveredUrl) => {
        if (!urlTraces.some((t) => t.url === discoveredUrl)) {
          urlTraces.push({
            url: discoveredUrl,
            status: "mapped",
            warning: "Broader search. Not limiting map results to prompt.",
            timing: {
              discoveredAt: new Date().toISOString(),
            },
            usedInCompletion: false,
          });
        }
      });
    }

    // Track all discovered URLs
    uniqueUrls.forEach((discoveredUrl) => {
      if (!urlTraces.some((t) => t.url === discoveredUrl)) {
        urlTraces.push({
          url: discoveredUrl,
          status: "mapped",
          timing: {
            discoveredAt: new Date().toISOString(),
          },
          usedInCompletion: false,
        });
      }
    });

    const existingUrls = new Set(mappedLinks.map((m) => m.url));
    const newUrls = uniqueUrls.filter((url) => !existingUrls.has(url));

    mappedLinks = [
      ...mappedLinks,
      ...newUrls.map((url) => ({ url, title: "", description: "" })),
    ];

    if (mappedLinks.length === 0) {
      mappedLinks = [{ url: baseUrl, title: "", description: "" }];
    }

    // Limit initial set of links (1000)
    mappedLinks = mappedLinks.slice(
      0,
      extractConfig.RERANKING.MAX_INITIAL_RANKING_LIMIT,
    );

    updateExtractCallback(mappedLinks.map((x) => x.url));

    let rephrasedPrompt = options.prompt ?? searchQuery;
    try {
      rephrasedPrompt =
        (await generateBasicCompletion(
          buildPreRerankPrompt(rephrasedPrompt, options.schema, baseUrl),
        )) ??
        "Extract the data according to the schema: " +
          JSON.stringify(options.schema, null, 2);
    } catch (error) {
      console.error("Error generating search query from schema:", error);
      rephrasedPrompt =
        "Extract the data according to the schema: " +
        JSON.stringify(options.schema, null, 2) +
        " " +
        options?.prompt; // Fallback to just the domain
    }

    //   "mapped-links.txt",
    //   mappedLinks,
    //   (link, index) => `${index + 1}. URL: ${link.url}, Title: ${link.title}, Description: ${link.description}`
    // );

    logger.info("Generated rephrased prompt.", {
      rephrasedPrompt,
    });

    const globTest = await generateCompletions({
      logger: logger.child({
        method: "processUrl/globTest",
      }),
      options: {
        mode: "llm",
        systemPrompt: `\
You are a relevance expert. Your are trying to filter down a list of URLs to \
select which ones hold the data the customer wants. First, you have to determine \
whether there is a common base URL for each page the user may want, based on the \
supplied list of links from the website.

Return only a single URL, the base URL, that represents the common base for all \
pages the customer wants to extract data from. If there is no common base, or the \
request requires semantic filtering of URLs, and cannot be done via base filtering, \
return an empty string.

For example, here's a query you may get:

"User request: Extract all blog post titles"

Example URLs:
 - https://stripe.com
 - https://stripe.com/about
 - https://stripe.com/pricing
 - https://stripe.com/blog-posts
 - https://stripe.com/blog/launch-week
 - https://stripe.com/signin
 - https://stripe.com/auth/callback

The expected response from you would be: "https://stripe.com/blog/"

Another example:

"User request: Extract all the red wines"

Example URLs:
 - https://www.winery.com/wines/Merlot
 - https://www.winery.com/wines/Pinot-Noir
 - https://www.winery.com/wines/Cabernet-Sauvignon
 - https://www.winery.com/wines/Syrah
 - https://www.winery.com/wines/Chardonnay
 - https://www.winery.com/wines/Sauvignon-Blanc

The expected response from you would be: "", an empty string, since this requires semantic filtering.`,
        prompt: `User request: ${options.prompt ?? searchQuery}`,
        schema: {
          type: "object",
          properties: {
            base_url: {
              type: "string",
            },
          },
          required: ["base_url"],
        },
      },
      markdown: mappedLinks.slice(0, 1000).map((x) => `- ${x.url}`).join("\n"),
      isExtractEndpoint: true,
    });

    const baseURL = globTest?.extract?.base_url;
    if (baseURL && typeof baseURL === "string" && baseURL.trim().length > 0) {
      const links = mappedLinks.map(x => x.url).filter(x => x.startsWith(baseURL));
      logger.info("Got a base URL from the glob test", { baseURL, linksCount: links.length });
      return links;
    }

    logger.info("Reranking pass 1 (threshold 0.8)...");
    const rerankerResult = await rerankLinksWithLLM({
      links: mappedLinks,
      searchQuery: rephrasedPrompt,
      urlTraces,
    });
    mappedLinks = rerankerResult.mapDocument;
    let tokensUsed = rerankerResult.tokensUsed;
    logger.info("Reranked! (pass 1)", {
      linkCount: mappedLinks.length,
    });

    // 2nd Pass, useful for when the first pass returns too many links
    if (mappedLinks.length > 100) {
      logger.info("Reranking (pass 2)...");
      const rerankerResult = await rerankLinksWithLLM({
        links: mappedLinks,
        searchQuery: rephrasedPrompt,
        urlTraces,
      });
      mappedLinks = rerankerResult.mapDocument;
      tokensUsed += rerankerResult.tokensUsed;
      logger.info("Reranked! (pass 2)", {
        linkCount: mappedLinks.length,
      });
    }

    // dumpToFile(
    //   "llm-links.txt",
    //   mappedLinks,
    //   (link, index) => `${index + 1}. URL: ${link.url}, Title: ${link.title}, Description: ${link.description}`
    // );
    // Remove title and description from mappedLinks
    mappedLinks = mappedLinks.map((link) => ({ url: link.url }));
    return mappedLinks.map((x) => x.url);
  } catch (error) {
    trace.status = "error";
    trace.error = error.message;
    trace.usedInCompletion = false;
    return [];
  }
}
