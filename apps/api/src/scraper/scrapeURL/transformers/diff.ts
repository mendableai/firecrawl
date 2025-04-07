import { supabase_service } from "../../../services/supabase";
import { Document } from "../../../controllers/v1/types";
import { Meta } from "../index";

export async function deriveDiff(meta: Meta, document: Document): Promise<Document> {
  if (meta.options.formats.includes("compare")) {
    const res = await supabase_service
        .rpc("diff_get_last_scrape_1", {
            i_team_id: meta.internalOptions.teamId,
            i_url: document.metadata.sourceURL ?? meta.url,
        });

    const data: {
        o_docs: Document[],
        o_date_added: string,
    } | undefined | null = (res.data ?? [])[0] as any;

    if (data && data.o_docs.length > 0) {
        const previousMarkdown = data.o_docs[0].markdown!;
        const currentMarkdown = document.markdown!;

        const transformer = (x: string) => [...x.replace(/\s+/g, "").replace(/\[iframe\]\(.+?\)/g, "")].sort().join("");

        document.compare = {
            previousScrapeAt: data.o_date_added,
            changeStatus: document.metadata.statusCode === 404 ? "removed" : transformer(previousMarkdown) === transformer(currentMarkdown) ? "same" : "changed",
            visibility: meta.internalOptions.urlInvisibleInCurrentCrawl ? "hidden" : "visible",
        }
    } else if (!res.error) {
        document.compare = {
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
