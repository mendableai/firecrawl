import { supabase_rr_service } from "../../../services/supabase";
import { Document } from "../../../controllers/v1/types";
import { Meta } from "../index";

export async function deriveDiff(meta: Meta, document: Document): Promise<Document> {
  if (meta.options.formats.includes("diff")) {
    const { data, error } = await supabase_rr_service
        .from("firecrawl_jobs")
        .select()
        .eq("team_id", meta.internalOptions.teamId)
        .eq("url", document.metadata.url ?? document.metadata.sourceURL ?? meta.url)
        .contains("page_options->>'formats'", "markdown")
        .order("date_added", { ascending: false })
        .limit(1)
        .single();

    if (data) {
        const previousMarkdown = data.docs[0].markdown;
        const currentMarkdown = document.markdown!;

        document.diff = {
            previousScrapeAt: data.date_added,
            changeStatus: previousMarkdown.replace(/\s+/g, "") === currentMarkdown.replace(/\s+/g, "") ? "same" : "changed",
            visibility: "visible",
        }
    } else if (!error) {
        document.diff = {
            previousScrapeAt: null,
            changeStatus: "new",
            visibility: "visible",
        }
    } else {
        meta.logger.error("Error fetching previous scrape", { error });
        document.warning = "Diffing failed, please try again later." + (document.warning ? ` ${document.warning}` : "");
    }
  }
  
  return document;
}
