import { Request, Response } from "express";
import {
  // Document,
  RequestWithAuth,
  ExtractRequest,
  extractRequestSchema,
  ExtractResponse,
  MapDocument,
  scrapeOptions,
} from "./types";
import { Document } from "../../lib/entities";
import Redis from "ioredis";
import { configDotenv } from "dotenv";
import { performRanking } from "../../lib/ranker";
import { billTeam } from "../../services/billing/credit_billing";
import { logJob } from "../../services/logging/log_job";
import { logger } from "../../lib/logger";
import { getScrapeQueue } from "../../services/queue-service";
import { waitForJob } from "../../services/queue-jobs";
import { addScrapeJob } from "../../services/queue-jobs";
import { PlanType } from "../../types";
import { getJobPriority } from "../../lib/job-priority";
import { generateOpenAICompletions } from "../../scraper/scrapeURL/transformers/llmExtract";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist";
import { getMapResults } from "./map";
import { buildDocument } from "../../lib/extract/build-document";

configDotenv();
const redis = new Redis(process.env.REDIS_URL!);

const MAX_EXTRACT_LIMIT = 100;
const MAX_RANKING_LIMIT = 10;
const SCORE_THRESHOLD = 0.75;

/**
 * Extracts data from the provided URLs based on the request parameters.
 * Currently in beta.
 * @param req - The request object containing authentication and extraction details.
 * @param res - The response object to send the extraction results.
 * @returns A promise that resolves when the extraction process is complete.
 */
export async function extractController(
  req: RequestWithAuth<{}, ExtractResponse, ExtractRequest>,
  res: Response<ExtractResponse>
) {
  const selfHosted = process.env.USE_DB_AUTHENTICATION !== "true";
  
  req.body = extractRequestSchema.parse(req.body);

  const id = crypto.randomUUID();
  let links: string[] = [];
  let docs: Document[] = [];
  const earlyReturn = false;

  // Process all URLs in parallel
  const urlPromises = req.body.urls.map(async (url) => {
    if (url.includes('/*') || req.body.allowExternalLinks) {
      // Handle glob pattern URLs
      const baseUrl = url.replace('/*', '');
      // const pathPrefix = baseUrl.split('/').slice(3).join('/'); // Get path after domain if any

      const allowExternalLinks = req.body.allowExternalLinks ?? true;
      let urlWithoutWww = baseUrl.replace("www.", "");
      let mapUrl = req.body.prompt && allowExternalLinks
        ? `${req.body.prompt} ${urlWithoutWww}`
        : req.body.prompt ? `${req.body.prompt} site:${urlWithoutWww}`
        : `site:${urlWithoutWww}`;

      const mapResults = await getMapResults({
        url: baseUrl,
        search: req.body.prompt,
        teamId: req.auth.team_id,
        plan: req.auth.plan,
        allowExternalLinks,
        origin: req.body.origin,
        limit: req.body.limit,
        // If we're self-hosted, we don't want to ignore the sitemap, due to our fire-engine mapping
        ignoreSitemap: !selfHosted ? true : false,
        includeMetadata: true,
        includeSubdomains: req.body.includeSubdomains,
      });

      let mappedLinks = mapResults.links as MapDocument[];
      // Limit number of links to MAX_EXTRACT_LIMIT
      mappedLinks = mappedLinks.slice(0, MAX_EXTRACT_LIMIT);

      let mappedLinksRerank = mappedLinks.map(x => `url: ${x.url}, title: ${x.title}, description: ${x.description}`);
      
      // Filter by path prefix if present
      // console.log("pathPrefix", pathPrefix);
      // wrong
      // if (pathPrefix) {
      //   mappedLinks = mappedLinks.filter(x => x.url && x.url.includes(`/${pathPrefix}/`));
      // }

      if (req.body.prompt) {
        const linksAndScores : { link: string, linkWithContext: string, score: number, originalIndex: number }[] = await performRanking(mappedLinksRerank, mappedLinks.map(l => l.url), mapUrl);
        mappedLinks = linksAndScores
          .filter(x => x.score > SCORE_THRESHOLD)
          .map(x => mappedLinks.find(link => link.url === x.link))
          .filter((x): x is MapDocument => x !== undefined && x.url !== undefined && !isUrlBlocked(x.url))
          .slice(0, MAX_RANKING_LIMIT);
        console.log("linksAndScores", linksAndScores);
        console.log("linksAndScores", linksAndScores.length);
      }

      return mappedLinks.map(x => x.url) as string[];

    } else {
      // Handle direct URLs without glob pattern
      if (!isUrlBlocked(url)) {
        return [url];
      }
      return [];
    }
  });

  // Wait for all URL processing to complete and flatten results
  const processedUrls = await Promise.all(urlPromises);
  links.push(...processedUrls.flat());

  console.log("links", links.length);
  // Scrape all links in parallel
  const scrapePromises = links.map(async (url) => {
    const origin = req.body.origin || "api";
    const timeout = req.body.timeout ?? 30000;
    const jobId = crypto.randomUUID();

    const jobPriority = await getJobPriority({
      plan: req.auth.plan as PlanType,
      team_id: req.auth.team_id,
      basePriority: 10,
    });

    await addScrapeJob(
      {
        url,
        mode: "single_urls", 
        team_id: req.auth.team_id,
        scrapeOptions: scrapeOptions.parse({}),
        internalOptions: {},
        plan: req.auth.plan!,
        origin,
        is_scrape: true,
      },
      {},
      jobId,
      jobPriority
    );

    const totalWait = 0;

    try {
      const doc = await waitForJob<Document>(jobId, timeout + totalWait);
      await getScrapeQueue().remove(jobId);
      if (earlyReturn) {
        return null;
      }
      return doc;
    } catch (e) {
      logger.error(`Error in scrapeController: ${e}`);
      if (e instanceof Error && (e.message.startsWith("Job wait") || e.message === "timeout")) {
        throw {
          status: 408,
          error: "Request timed out"
        };
      } else {
        throw {
          status: 500,
          error: `(Internal server error) - ${(e && e.message) ? e.message : e}`
        };
      }
    }
  });

  try {
    const results = await Promise.all(scrapePromises);
    docs.push(...results.filter(doc => doc !== null).map(x => x!));
  } catch (e) {
    return res.status(e.status).json({
      success: false,
      error: e.error
    });
  }

  const completions = await generateOpenAICompletions(
    logger.child({ method: "extractController/generateOpenAICompletions" }),
    {
      mode: "llm",
      systemPrompt: "Only use the provided content to answer the question.",
      prompt: req.body.prompt,
      schema: req.body.schema,
    },
    docs.map(x => buildDocument(x)).join('\n')
  );

  // console.log("completions", completions);

  // if(req.body.extract && req.body.formats.includes("extract")) {
  //   creditsToBeBilled = 5;
  // }

  // TODO: change this later
  // While on beta, we're billing 5 credits per link discovered/scraped.
  billTeam(req.auth.team_id, req.acuc?.sub_id, links.length * 5).catch(error => {
    logger.error(`Failed to bill team ${req.auth.team_id} for ${links.length * 5} credits: ${error}`);
    // Optionally, you could notify an admin or add to a retry queue here
  });


  console.log("completions.extract", completions.extract);

  let data: any;
  try {
    data = JSON.parse(completions.extract);
  } catch (e) {
    data = completions.extract;
  }

  logJob({
    job_id: id,
    success: true,
    message: "Extract completed",
    num_docs: 1,
    docs: data,
    time_taken: (new Date().getTime() - Date.now()) / 1000,
    team_id: req.auth.team_id,
    mode: "extract",
    url: req.body.urls.join(", "),
    scrapeOptions: req.body,
    origin: req.body.origin ?? "api",
    num_tokens: completions.numTokens ?? 0
  });

  return res.status(200).json({
    success: true,
    data: data,
    scrape_id: id,
  });
}