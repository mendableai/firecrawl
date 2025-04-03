import { MapDocument, TokenUsage, URLTrace } from "../../controllers/v1/types";
import { getMapResults } from "../../controllers/v1/map";
import { PlanType } from "../../types";
import { removeDuplicateUrls } from "../validateUrl";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist";
import { buildPreRerankPrompt, buildRefrasedPrompt } from "./build-prompts";
import { rerankLinksWithLLM } from "./reranker";
import { extractConfig } from "./config";
import type { Logger } from "winston";
import { generateText } from "ai";
import { getModel } from "../generic-ai";
import { calculateTokens } from "./usage/llm-cost";
import fs from "fs/promises";

export async function generateBasicCompletion(prompt: string): Promise<{completion: string, tokenUsage: TokenUsage}> {
  const model = getModel("gpt-4", "openai");
  const { text, usage } = await generateText({
    model: model,
    prompt: prompt,
    providerOptions: {
      anthropic: {
        thinking: { type: "enabled", budgetTokens: 12000 },
      },
    },
  });

  const promptTokens = calculateTokens(prompt, model.modelId);
  const completionTokens = calculateTokens(text, model.modelId);

  return {
    completion: text,
    tokenUsage: {
      promptTokens: promptTokens,
      completionTokens: completionTokens,
      totalTokens: promptTokens + completionTokens,
      model: model.modelId,
    }
  };
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
  log?: any;
  isMultiEntity: boolean;
  reasoning: string;
  multiEntityKeys: string[];
  keyIndicators: string[];
}

export async function processUrl(
  options: ProcessUrlOptions,
  urlTraces: URLTrace[],
  updateExtractCallback: (links: string[]) => void,
  logger: Logger,
): Promise<{
  urls: string[];
  tokenUsage: TokenUsage[];
}> {
  let tokenUsage: TokenUsage[] = [];

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
      return {
        urls: [options.url],
        tokenUsage,
      };
    }
    logger.warn("URL is blocked");
    trace.status = "error";
    trace.error = "URL is blocked";
    trace.usedInCompletion = false;
    return {
      urls: [],
      tokenUsage,
    };
  }

  const baseUrl = options.url.replace("/*", "");
  let urlWithoutWww = baseUrl.replace("www.", "");

  let searchQuery = options.prompt;
  if (options.prompt) {
    const { completion, tokenUsage: usage } = await generateBasicCompletion(
      buildRefrasedPrompt(options.prompt, baseUrl),
    )
      
    searchQuery = completion?.replace('"', "").replace("/", "") ?? options.prompt;
    tokenUsage.push(usage);
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
    options.log["uniqueUrlsLength-1"] = uniqueUrls.length;

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

    options.log["uniqueUrlsLength-2"] = uniqueUrls.length;

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
      const { completion, tokenUsage: usage } = await generateBasicCompletion(
        buildPreRerankPrompt(rephrasedPrompt, options.schema, baseUrl),
      )
      rephrasedPrompt = completion ??
        "Extract the data according to the schema: " +
          JSON.stringify(options.schema, null, 2);
      tokenUsage.push(usage);
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

    logger.info("Reranking pass 1 (threshold 0.8)...");
    const rerankerResult = await rerankLinksWithLLM({
      links: mappedLinks,
      searchQuery: rephrasedPrompt,
      urlTraces,
      isMultiEntity: options.isMultiEntity,
      reasoning: options.reasoning,
      multiEntityKeys: options.multiEntityKeys,
      keyIndicators: options.keyIndicators,
    });
    tokenUsage = tokenUsage.concat(rerankerResult.tokenUsage);
    mappedLinks = rerankerResult.mapDocument;
    logger.info("Reranked! (pass 1)", {
      linkCount: mappedLinks.length,
    });
    options.log["rerankerResult-1"] = mappedLinks.length;
    // 2nd Pass, useful for when the first pass returns too many links
    if (mappedLinks.length > 100) {
      logger.info("Reranking (pass 2)...");
      const rerankerResult = await rerankLinksWithLLM({
        links: mappedLinks,
        searchQuery: rephrasedPrompt,
        urlTraces,
        isMultiEntity: options.isMultiEntity,
        reasoning: options.reasoning,
        multiEntityKeys: options.multiEntityKeys,
        keyIndicators: options.keyIndicators,
      });
      tokenUsage = tokenUsage.concat(rerankerResult.tokenUsage);
      mappedLinks = rerankerResult.mapDocument;
      // tokensUsed += rerankerResult.tokensUsed;
      logger.info("Reranked! (pass 2)", {
        linkCount: mappedLinks.length,
      });
    }
    options.log["rerankerResult-2"] = mappedLinks.length;

    await fs.writeFile(`logs/tokenUsage-5.json`, JSON.stringify(tokenUsage, null, 2));


    // dumpToFile(
    //   "llm-links.txt",
    //   mappedLinks,
    //   (link, index) => `${index + 1}. URL: ${link.url}, Title: ${link.title}, Description: ${link.description}`
    // );
    // Remove title and description from mappedLinks
    mappedLinks = mappedLinks.map((link) => ({ url: link.url }));
    return {
      urls: mappedLinks.map((x) => x.url),
      tokenUsage,
    };
  } catch (error) {
    trace.status = "error";
    trace.error = error.message;
    trace.usedInCompletion = false;
    return {
      urls: [],
      tokenUsage,
    };
  }
}
