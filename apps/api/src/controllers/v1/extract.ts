import { Request, Response } from "express";
import {
  Document,
  RequestWithAuth,
  ExtractRequest,
  extractRequestSchema,
  ExtractResponse,
  MapDocument,
} from "./types";
import { v4 as uuidv4 } from "uuid";
import { getJobPriority } from "../../lib/job-priority";
import { PlanType } from "../../types";
import { getMapResults } from "./map";



export async function extractController(
  req: RequestWithAuth<{}, ExtractResponse, ExtractRequest>,
  res: Response<ExtractResponse>
) {
  req.body = extractRequestSchema.parse(req.body);
  let earlyReturn = false;

  const origin = req.body.origin;
  const timeout = req.body.timeout;
//   const pageOptions = legacyScrapeOptions(req.body);
//   const extractorOptions = req.body.extract ? legacyExtractorOptions(req.body.extract) : undefined;
  const jobId = uuidv4();

  const startTime = new Date().getTime();
  const jobPriority = await getJobPriority({
    plan: req.auth.plan as PlanType,
    team_id: req.auth.team_id,
    basePriority: 10,
  });

  const urls = req.body.urls;
  const mappedDocuments: MapDocument[] = [];

  const prompt = req.body.prompt;
  // const keywords = await generateBasicCompletion(`If the user's prompt is: "${prompt}", what are the most important keywords besides the extraction task? Output only the keywords, separated by commas.`);

  for (const url of urls) {
    if (url.endsWith("/*")) {
      const mapResults = await getMapResults({
        url: url.slice(0, -2),
        search: req.body.prompt,
        limit: 100,
        ignoreSitemap: true,
        includeSubdomains: false,
        crawlerOptions: {},
        teamId: req.auth.team_id,
        plan: req.auth.plan,
        origin: req.body.origin,
        subId: req.acuc?.sub_id,
        includeMetadata: true
      });
  //     // top 3 links 
  //     const top3Links = (mapResults.links as MapDocument[]).slice(0, 3);
  //     console.log(top3Links);
  //   //   console.log(top3Links);
  //     mappedDocuments.push(...(mapResults.links as MapDocument[]));
  //      // transform mappedUrls to just documents
  // // we quickly rerank
  //     const rerank = await rerankDocuments(mappedDocuments.map(x => `URL: ${x.url}\nTITLE: ${x.title}\nDESCRIPTION: ${x.description}`), "What URLs are most relevant to the following prompt: " + (req.body.prompt || '').toLocaleLowerCase().replace("extract", " ").replace("extract ", " "));
  //     console.log(rerank);
    } else {
        mappedDocuments.push({ url });
    }
  }

  req.body.urls = mappedDocuments.map(x => x.url);

 

//   const job = await addScrapeJob(
//     {
//       url: req.body.url,
//       mode: "single_urls",
//       crawlerOptions: {},
//       team_id: req.auth.team_id,
//       plan: req.auth.plan,
//       pageOptions,
//       extractorOptions,
//       origin: req.body.origin,
//       is_scrape: true,
//     },
//     {},
//     jobId,
//     jobPriority
//   );

//   const totalWait = (req.body.waitFor ?? 0) + (req.body.actions ?? []).reduce((a,x) => (x.type === "wait" ? x.milliseconds : 0) + a, 0);

//   let doc: any | undefined;
//   try {
//     doc = (await waitForJob(job.id, timeout + totalWait))[0];
//   } catch (e) {
//     Logger.error(`Error in scrapeController: ${e}`);
//     if (e instanceof Error && e.message.startsWith("Job wait")) {
//       return res.status(408).json({
//         success: false,
//         error: "Request timed out",
//       });
//     } else {
//       return res.status(500).json({
//         success: false,
//         error: `(Internal server error) - ${e && e?.message ? e.message : e} ${
//           extractorOptions && extractorOptions.mode !== "markdown"
//             ? " - Could be due to LLM parsing issues"
//             : ""
//         }`,
//       });
//     }
//   }

//   await job.remove();

//   if (!doc) {
//     console.error("!!! PANIC DOC IS", doc, job);
//     return res.status(200).json({
//       success: true,
//       warning: "No page found",
//       data: doc,
//     });
//   }

//   delete doc.index;
//   delete doc.provider;

//   const endTime = new Date().getTime();
//   const timeTakenInSeconds = (endTime - startTime) / 1000;
//   const numTokens =
//     doc && doc.markdown
//       ? numTokensFromString(doc.markdown, "gpt-3.5-turbo")
//       : 0;

//   let creditsToBeBilled = 1; // Assuming 1 credit per document
//   if (earlyReturn) {
//     // Don't bill if we're early returning
//     return;
//   }
//   if(req.body.extract && req.body.formats.includes("extract")) {
//     creditsToBeBilled = 5;
//   }

//   billTeam(req.auth.team_id, req.acuc?.sub_id, creditsToBeBilled).catch(error => {
//     Logger.error(`Failed to bill team ${req.auth.team_id} for ${creditsToBeBilled} credits: ${error}`);
//     // Optionally, you could notify an admin or add to a retry queue here
//   });

//   if (!pageOptions || !pageOptions.includeRawHtml) {
//     if (doc && doc.rawHtml) {
//       delete doc.rawHtml;
//     }
//   }

//   if(pageOptions && pageOptions.includeExtract) {
//     if(!pageOptions.includeMarkdown && doc && doc.markdown) {
//       delete doc.markdown;
//     }
//   }

//   logJob({
//     job_id: jobId,
//     success: true,
//     message: "Scrape completed",
//     num_docs: 1,
//     docs: [doc],
//     time_taken: timeTakenInSeconds,
//     team_id: req.auth.team_id,
//     mode: "scrape",
//     url: req.body.url,
//     crawlerOptions: {},
//     pageOptions: pageOptions,
//     origin: origin,
//     extractor_options: extractorOptions,
//     num_tokens: numTokens,
//   });

  return res.status(200).json({
    success: true,
    data: {} as Document,
    scrape_id: origin?.includes("website") ? jobId : undefined,
  });
}
