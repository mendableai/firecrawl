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

configDotenv();
const redis = new Redis(process.env.REDIS_URL!);

const MAX_EXTRACT_LIMIT = 100;
const MAX_RANKING_LIMIT = 5;
const SCORE_THRESHOLD = 0.75;

export async function extractController(
  req: RequestWithAuth<{}, ExtractResponse, ExtractRequest>,
  res: Response<ExtractResponse>
) {
  req.body = extractRequestSchema.parse(req.body);

  const id = crypto.randomUUID();
  let links: string[] = [];
  let docs: Document[] = [];
  const earlyReturn = false;

  // Process all URLs in parallel
  const urlPromises = req.body.urls.map(async (url) => {
    if (url.includes('/*')) {
      // Handle glob pattern URLs
      const baseUrl = url.replace('/*', '');
      const pathPrefix = baseUrl.split('/').slice(3).join('/'); // Get path after domain if any

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
        ignoreSitemap: false,
        includeMetadata: true,
        includeSubdomains: req.body.includeSubdomains,
      });

      let mappedLinks = mapResults.links.map(x => `url: ${x.url}, title: ${x.title}, description: ${x.description}`);
      
      // Filter by path prefix if present
      if (pathPrefix) {
        mappedLinks = mappedLinks.filter(x => x.includes(`/${pathPrefix}/`));
      }

      if (req.body.prompt) {
        const linksAndScores = await performRanking(mappedLinks, mapUrl);
        mappedLinks = linksAndScores
          .filter(x => x.score > SCORE_THRESHOLD)
          .map(x => x.link.split("url: ")[1].split(",")[0])
          .filter(x => !isUrlBlocked(x))
          .slice(0, MAX_RANKING_LIMIT);
      }

      return mappedLinks;

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
    docs.map(x => x.markdown).join('\n')
  );

  // console.log("completions", completions);

  // if(req.body.extract && req.body.formats.includes("extract")) {
  //   creditsToBeBilled = 5;
  // }

  // billTeam(req.auth.team_id, req.acuc?.sub_id, creditsToBeBilled).catch(error => {
  //   logger.error(`Failed to bill team ${req.auth.team_id} for ${creditsToBeBilled} credits: ${error}`);
  //   // Optionally, you could notify an admin or add to a retry queue here
  // });

  // if (!req.body.formats.includes("rawHtml")) {
  //   if (doc && doc.rawHtml) {
  //     delete doc.rawHtml;
  //   }
  // }

  // logJob({
  //   job_id: jobId,
  //   success: true,
  //   message: "Scrape completed",
  //   num_docs: 1,
  //   docs: [doc],
  //   time_taken: timeTakenInSeconds,
  //   team_id: req.auth.team_id,
  //   mode: "scrape",
  //   url: req.body.url,
  //   scrapeOptions: req.body,
  //   origin: origin,
  //   num_tokens: numTokens,
  // });



  // billTeam(teamId, subId, 1).catch((error) => {
  //   logger.error(
  //     `Failed to bill team ${teamId} for 1 credit: ${error}`
  //   );
  // });

  // const linksToReturn = links.slice(0, limit);

  // logJob({
  //   job_id: id,
  //   success: links.length > 0,
  //   message: "Extract completed", 
  //   num_docs: linksToReturn.length,
  //   docs: linksToReturn,
  //   time_taken: (new Date().getTime() - Date.now()) / 1000,
  //   team_id: teamId,
  //   mode: "extract",
  //   url: urls[0],
  //   crawlerOptions: {},
  //   scrapeOptions: {},
  //   origin: origin ?? "api",
  //   num_tokens: 0,
  // });

  // return {

  // };



  // const response = {
  //   success: true as const,
  //   data: result.data,
  //   scrape_id: result.scrape_id
  // };

  console.log("completions.extract", completions.extract);

  let data: any;
  try {
    data = JSON.parse(completions.extract);
  } catch (e) {
    data = completions.extract;
  }

  return res.status(200).json({
    success: true,
    data: data,
    scrape_id: id,
  });
}