import { Request, Response } from "express";
import { Logger } from "../../../src/lib/logger";
import { checkAndUpdateURL } from "../../../src/lib/validateUrl";
import { MapRequest, mapRequestSchema, MapResponse, RequestWithAuth } from "./types";
import { checkTeamCredits } from "../../services/billing/credit_billing";

export async function mapController(req: RequestWithAuth<MapResponse, MapRequest>, res: Response<MapResponse>) {
  req.body = mapRequestSchema.parse(req.body);
  console.log(req.body);
  // expected req.body

  // req.body = {
  //   url: string
  //   crawlerOptions: 
  // }


  return res.status(200).json({ success: true, links: [ "test1", "test2" ] });

  // const mode = req.body.mode ?? "crawl";

  // const crawlerOptions = { ...defaultCrawlerOptions, ...req.body.crawlerOptions };
  // const pageOptions = { ...defaultCrawlPageOptions, ...req.body.pageOptions };

  // if (mode === "single_urls" && !url.includes(",")) { // NOTE: do we need this?
  //   try {
  //     const a = new WebScraperDataProvider();
  //     await a.setOptions({
  //       jobId: uuidv4(),
  //       mode: "single_urls",
  //       urls: [url],
  //       crawlerOptions: { ...crawlerOptions, returnOnlyUrls: true },
  //       pageOptions: pageOptions,
  //     });

  //     const docs = await a.getDocuments(false, (progress) => {
  //       job.progress({
  //         current: progress.current,
  //         total: progress.total,
  //         current_step: "SCRAPING",
  //         current_url: progress.currentDocumentUrl,
  //       });
  //     });
  //     return res.json({
  //       success: true,
  //       documents: docs,
  //     });
  //   } catch (error) {
  //     Logger.error(error);
  //     return res.status(500).json({ error: error.message });
  //   }
  // }

  // const job = await addWebScraperJob({
  //   url: url,
  //   mode: mode ?? "crawl", // fix for single urls not working
  //   crawlerOptions: crawlerOptions,
  //   team_id: team_id,
  //   pageOptions: pageOptions,
  //   origin: req.body.origin ?? defaultOrigin,
  // });

  // await logCrawl(job.id.toString(), team_id);

  // res.json({ jobId: job.id });
}
