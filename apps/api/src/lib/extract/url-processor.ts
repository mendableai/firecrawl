import { MapDocument, URLTrace } from "../../controllers/v1/types";
import { getMapResults } from "../../controllers/v1/map";
import { PlanType } from "../../types";
import { removeDuplicateUrls } from "../validateUrl";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist";
import { generateBasicCompletion } from "../LLM-extraction";
import { buildPreRerankPrompt, buildRefrasedPrompt } from "./build-prompts";
import { rerankLinksWithLLM } from "./reranker";
import { extractConfig } from "./config";
import { updateExtract } from "./extract-redis";
import { ExtractStep } from "./extract-redis";

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

    console.log("search query: ", rephrasedPrompt);


    const rerankerResult = await rerankLinksWithLLM(
      mappedLinks,
      rephrasedPrompt,
      urlTraces,
    );
    mappedLinks = rerankerResult.mapDocument;
    let tokensUsed = rerankerResult.tokensUsed;

    // 2nd Pass, useful for when the first pass returns too many links
    if (mappedLinks.length > 100) {
      const rerankerResult = await rerankLinksWithLLM(
        mappedLinks,
        rephrasedPrompt,
        urlTraces,
      );
      mappedLinks = rerankerResult.mapDocument;
      tokensUsed += rerankerResult.tokensUsed;
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
