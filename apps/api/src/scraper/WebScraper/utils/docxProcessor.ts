import axios from "axios";
import fs from "fs";
import { createWriteStream } from "node:fs";
import path from "path";
import os from "os";
import mammoth from "mammoth";
import { logger } from "../../../lib/logger";

export async function fetchAndProcessDocx(url: string): Promise<{ content: string; pageStatusCode: number; pageError: string | undefined }> {
  let tempFilePath = '';
  let pageStatusCode = 200;
  let pageError: string | undefined = '';
  let content = '';

  try {
    const downloadResult = await downloadDocx(url);
    tempFilePath = downloadResult.tempFilePath;
    pageStatusCode = downloadResult.pageStatusCode;
    pageError = downloadResult.pageError;
    content = await processDocxToText(tempFilePath);
  } catch (error) {
    logger.error(`Failed to fetch and process DOCX: ${error.message}`);
    pageStatusCode = 500;
    pageError = error.message;
    content = '';
  } finally {
    if (tempFilePath) {
      fs.unlinkSync(tempFilePath); // Clean up the temporary file
    }
  }

  return { content, pageStatusCode, pageError };
}

async function downloadDocx(url: string): Promise<{ tempFilePath: string; pageStatusCode: number; pageError: string | undefined }> {
  try {
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
      writer.on("error", () => {
        logger.error('Failed to write DOCX file to disk');
        reject(new Error('Failed to write DOCX file to disk'));
      });
    });
  } catch (error) {
    logger.error(`Failed to download DOCX: ${error.message}`);
    return { tempFilePath: "", pageStatusCode: 500, pageError: error.message };
  }
}

export async function processDocxToText(filePath: string): Promise<string> {
  try {
    const content = await extractTextFromDocx(filePath);
    return content;
  } catch (error) {
    logger.error(`Failed to process DOCX to text: ${error.message}`);
    return "";
  }
}

async function extractTextFromDocx(filePath: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    logger.error(`Failed to extract text from DOCX: ${error.message}`);
    return "";
  }
}
