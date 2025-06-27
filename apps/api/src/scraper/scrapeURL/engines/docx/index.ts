import { Meta } from "../..";
import { EngineScrapeResult } from "..";
import { downloadFile } from "../utils/downloadFile";
import mammoth from "mammoth";

export async function scrapeDOCX(meta: Meta, timeToRun: number | undefined): Promise<EngineScrapeResult> {
  const { response, tempFilePath } = await downloadFile(meta.id, meta.rewrittenUrl ?? meta.url, {
    headers: meta.options.headers,
    signal: meta.internalOptions.abort ?? AbortSignal.timeout(timeToRun ?? 300000),
  });

  return {
    url: response.url,
    statusCode: response.status,

    html: (await mammoth.convertToHtml({ path: tempFilePath })).value,

    proxyUsed: "basic",
  };
}
