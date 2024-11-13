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
import { StoredCrawl, crawlToCrawler } from "../../lib/crawl-redis";
import { fireEngineMap } from "../../search/fireEngine";
import Redis from "ioredis";
import { configDotenv } from "dotenv";
import { performRanking } from "../../lib/ranker";
import { checkAndUpdateURLForMap } from "../../lib/validateUrl";
import { isSameDomain } from "../../lib/validateUrl";
import { isSameSubdomain } from "../../lib/validateUrl";
import { removeDuplicateUrls } from "../../lib/validateUrl";
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
  let links: string[]; //= req.body.urls;

  const sc: StoredCrawl = {
    originUrl: req.body.urls[0],
    crawlerOptions: {
      // ...crawlerOptions,
      scrapeOptions: undefined,
    },
    scrapeOptions: scrapeOptions.parse({}),
    internalOptions: {},
    team_id: req.auth.team_id,
    createdAt: Date.now(),
    plan: req.auth.plan!,
  };

  const crawler = crawlToCrawler(id, sc);

  let urlWithoutWww = req.body.urls[0].replace("www.", "");
  console.log("urlWithoutWww", urlWithoutWww);

  const allowExternalLinks = req.body.allowExternalLinks ?? false;

  let mapUrl = req.body.prompt && allowExternalLinks
    ? `${req.body.prompt} ${urlWithoutWww}`
    : req.body.prompt ? `${req.body.prompt} site:${urlWithoutWww}`
    : `site:${urlWithoutWww}`;

  const resultsPerPage = 100;
  const maxPages = Math.ceil(MAX_EXTRACT_LIMIT / resultsPerPage);

  const cacheKey = `fireEngineMap:${mapUrl}`;
  const cachedResult = null;

  let allResults: any[] = [];
  let pagePromises: Promise<any>[] = [];

  if (cachedResult) {
    allResults = JSON.parse(cachedResult);
  } else {
    const fetchPage = async (page: number) => {
      return fireEngineMap(mapUrl, {
        numResults: resultsPerPage,
        page: page,
      });
    };

    pagePromises = Array.from({ length: maxPages }, (_, i) => fetchPage(i + 1));
    allResults = (await Promise.all(pagePromises)).flat();
    // console.log("allResults", allResults);
    // if allResults is empty, return an error
    if (allResults.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No results found",
      });
    }

    await redis.set(cacheKey, JSON.stringify(allResults), "EX", 24 * 60 * 60); // Cache for 24 hours
  }

  // console.log("allResults", allResults);
  // Parallelize sitemap fetch with serper search
  // const [sitemap, ...searchResults] = await Promise.all([
  //   req.body.ignoreSitemap ? null : null, // crawler.tryGetSitemap(),
  //   ...(cachedResult ? [] : pagePromises),
  // ]);

  // if (!cachedResult) {
  //   allResults = searchResults;
  // }

  links = allResults.map(x => `url: ${x.url}, title: ${x.title}, description: ${x.description}`);
  console.log("links", links);
  // if (sitemap !== null) {
  //   sitemap.forEach((x) => {
  //     links.push(x.url);
  //   });
  // }

  // let mapResults = allResults
  //   .flat()
  //   .filter((result) => result !== null && result !== undefined);

  // const minumumCutoff = Math.min(MAX_EXTRACT_LIMIT, req.body.limit ?? MAX_EXTRACT_LIMIT);
  // if (mapResults.length > minumumCutoff) {
  //   mapResults = mapResults.slice(0, minumumCutoff);
  // }

  // if (mapResults.length > 0) {
  //   if (req.body.prompt) {
  //     // Ensure all map results are first, maintaining their order
  //     links = [
  //       mapResults[0].url,
  //       ...mapResults.slice(1).map((x) => x.url),
  //       ...links,
  //     ];
  //   } else {
  //     mapResults.map((x) => {
  //       links.push(x.url);
  //     });
  //   }
  // }

  // console.log("mapResults", mapResults);

  // console.log("links", links);
  let linksAndScores: { link: string; score: number }[] = [];
  // Perform cosine similarity between the search query and the list of links
  if (req.body.prompt) {
    const searchQuery = mapUrl; //req.body.prompt.toLowerCase();
    linksAndScores = await performRanking(links, searchQuery);
  }
  console.log("linksAndScores", linksAndScores);
  links = linksAndScores
    .filter(x => x.score > SCORE_THRESHOLD)
    .map(x => x.link.split("url: ")[1].split(",")[0])
    .filter(x => !isUrlBlocked(x))

  console.log("links:", links.length);

  // should we use some sort of llm to determine the best links?

  // console.log("linksAndScores", linksAndScores);

  // links = links
  //   .map((x) => {
  //     try {
  //       return checkAndUpdateURLForMap(x).url.trim();
  //     } catch (_) {
  //       return null;
  //     }
  //   })
  //   .filter((x) => x !== null) as string[];

  // allows for subdomains to be included
  // links = links.filter((x) => isSameDomain(x, req.body.urls[0]));

  // if includeSubdomains is false, filter out subdomains
  // if (!req.body.includeSubdomains) {
  //   links = links.filter((x) => isSameSubdomain(x, req.body.urls[0]));
  // z}

  // remove duplicates that could be due to http/https or www
  // links = removeDuplicateUrls(links);

  // get top N links
  links = links.slice(0, MAX_RANKING_LIMIT);

  // scrape the links
  let earlyReturn = false;
  let docs: Document[] = [];

  for (const url of links) {
    const origin = req.body.origin || "api";
    const timeout = req.body.timeout ?? 30000;
    const jobId = crypto.randomUUID();

    const startTime = new Date().getTime();
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

    const totalWait = 0 //60000 // (req.body.waitFor ?? 0) + (req.body.actions ?? []).reduce((a,x) => (x.type === "wait" ? x.milliseconds ?? 0 : 0) + a, 0);

    let doc: Document;
    try {
      doc = await waitForJob<Document>(jobId, timeout + totalWait); // TODO: better types for this
    } catch (e) {
      logger.error(`Error in scrapeController: ${e}`);
      if (e instanceof Error && (e.message.startsWith("Job wait") || e.message === "timeout")) {
        return res.status(408).json({
          success: false,
          error: "Request timed out",
        });
      } else {
        return res.status(500).json({
          success: false,
          error: `(Internal server error) - ${(e && e.message) ? e.message : e}`,
        });
      }
    }

    await getScrapeQueue().remove(jobId);

    // const endTime = new Date().getTime();
    // const timeTakenInSeconds = (endTime - startTime) / 1000;
    // const numTokens =
    //   doc && doc.extract
    //     // ? numTokensFromString(doc.markdown, "gpt-3.5-turbo")
    //   ? 0 // TODO: fix
    //   : 0;

    let creditsToBeBilled = 1; // Assuming 1 credit per document
    if (earlyReturn) {
      // Don't bill if we're early returning
      return;
    }
    docs.push(doc);
  }

  console.log(docs)

  const completions = await generateOpenAICompletions(
    logger.child({ method: "extractController/generateOpenAICompletions" }),
    {
      mode: "llm",
      systemPrompt: "Only use the provided content to answer the question.",
      prompt: mapUrl,
      schema: req.body.schema,
    },
    docs.map(x => x.markdown).join('\n')
  );

  console.log("completions", completions);

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
    data: data, // includeMetadata ? mapResults : linksToReturn,
    scrape_id: id, //origin?.includes("website") ? id : undefined,
  });
}