import axios from "axios";
import fs from "fs";
import { createWriteStream } from "node:fs";
import path from "path";
import os from "os";
import mammoth from "mammoth";

export async function fetchAndProcessDocx(url: string): Promise<{ content: string; pageStatusCode: number; pageError: string }> {
  const { tempFilePath, pageStatusCode, pageError } = await downloadDocx(url);
  const content = await processDocxToText(tempFilePath);
  fs.unlinkSync(tempFilePath); // Clean up the temporary file
  return { content, pageStatusCode, pageError };
}

async function downloadDocx(url: string): Promise<{ tempFilePath: string; pageStatusCode: number; pageError: string }> {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  const tempFilePath = path.join(os.tmpdir(), `tempDocx-${Date.now()}.docx`);
  const writer = createWriteStream(tempFilePath);

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve({ tempFilePath, pageStatusCode: response.status, pageError: response.statusText != "OK" ? response.statusText : undefined }));
    writer.on("error", reject);
  });
}

export async function processDocxToText(filePath: string): Promise<string> {
  const content = await extractTextFromDocx(filePath);
  return content;
}

async function extractTextFromDocx(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}
