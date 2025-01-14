import { Meta } from "../..";
import { EngineScrapeResult } from "..";
import { downloadFile } from "../utils/downloadFile";
import mammoth from "mammoth";

export async function scrapeDOCX(meta: Meta): Promise<EngineScrapeResult> {
  const { response, tempFilePath } = await downloadFile(meta.id, meta.url, {
    headers: meta.options.headers,
  });

  return {
    url: response.url,
    statusCode: response.status,

    html: (await mammoth.convertToHtml({ path: tempFilePath })).value,
  };
}
