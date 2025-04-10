import { supabase_service } from "../../../services/supabase";
import { Document } from "../../../controllers/v1/types";
import { Meta } from "../index";
import { getJob } from "../../../controllers/v1/crawl-status";

export async function deriveDiff(meta: Meta, document: Document): Promise<Document> {
  if (meta.options.formats.includes("changeTracking")) {
    const res = await supabase_service
        .rpc("diff_get_last_scrape_2", {
            i_team_id: meta.internalOptions.teamId,
            i_url: document.metadata.sourceURL ?? meta.url,
        });

    const data: {
        o_job_id: string,
        o_date_added: string,
    } | undefined | null = (res.data ?? [])[0] as any;

    const job: {
        returnvalue: Document,
    } | null = data?.o_job_id ? await getJob(data.o_job_id) : null;

    console.log(data, job);

    if (data && job && job?.returnvalue) {
        const previousMarkdown = job.returnvalue.markdown!;
        const currentMarkdown = document.markdown!;

        const transformer = (x: string) => [...x.replace(/\s+/g, "").replace(/\[iframe\]\(.+?\)/g, "")].sort().join("");

        document.changeTracking = {
            previousScrapeAt: data.o_date_added,
            changeStatus: document.metadata.statusCode === 404 ? "removed" : transformer(previousMarkdown) === transformer(currentMarkdown) ? "same" : "changed",
            visibility: meta.internalOptions.urlInvisibleInCurrentCrawl ? "hidden" : "visible",
        }
    } else if (!res.error) {
        document.changeTracking = {
            previousScrapeAt: null,
            changeStatus: document.metadata.statusCode === 404 ? "removed" : "new",
            visibility: meta.internalOptions.urlInvisibleInCurrentCrawl ? "hidden" : "visible",
        }
    } else {
        meta.logger.error("Error fetching previous scrape", { error: res.error });
        document.warning = "Comparing failed, please try again later." + (document.warning ? ` ${document.warning}` : "");
    }
  }
  
  return document;
}
