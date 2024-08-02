import axios, { AxiosResponse } from "axios";
import fs from "fs";
import { createReadStream, createWriteStream } from "node:fs";
import FormData from "form-data";
import dotenv from "dotenv";
import pdf from "pdf-parse";
import path from "path";
import os from "os";
import { axiosTimeout } from "../../../lib/timeout";
import { Logger } from "../../../lib/logger";
import { LlamaParseReader } from "llamaindex";

dotenv.config();

export async function fetchAndProcessPdf(url: string, parsePDF: boolean, timeout: number): Promise<{ content: string, pageStatusCode?: number, pageError?: string }> {
  try {
    // TODO: make timeout configurable
    const startTime = Date.now();
    const { tempFilePath, pageStatusCode, pageError } = await downloadPdf(url, timeout);
    Logger.debug(`Downloaded PDF to ${tempFilePath}`);
    const remainingTime = timeout - (Date.now() - startTime);
    console.log({remainingTime})
    if (remainingTime <= 0) {
      return { content: "", pageStatusCode: 408, pageError: "Request Timeout" }
    }
    const content = await processPdfToText(tempFilePath, parsePDF, remainingTime);
    fs.unlinkSync(tempFilePath); // Clean up the temporary file
    return { content, pageStatusCode, pageError };
  } catch (error) {
    Logger.error(`Failed to fetch and process PDF: ${error.message}`);
    return { content: "", pageStatusCode: 500, pageError: error.message };
  }
}

async function downloadPdf(url: string, timeout: number): Promise<{ tempFilePath: string, pageStatusCode?: number, pageError?: string }> {
  Logger.debug(`Starting download of PDF from ${url}`);
  try {
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
      timeout: timeout ?? axiosTimeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
      }
    });

    const tempFilePath = path.join(os.tmpdir(), `tempPdf-${Date.now()}.pdf`);
    const writer = createWriteStream(tempFilePath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        Logger.debug(`PDF downloaded successfully to ${tempFilePath}`);
        resolve({ tempFilePath, pageStatusCode: response.status, pageError: response.statusText != "OK" ? response.statusText : undefined });
      });

      writer.on('error', err => {
        Logger.error(`Error writing PDF to disk: ${err.message}`);
        fs.unlink(tempFilePath, () => {
          reject(err);
        });
      });

      response.data.on('error', err => {
        Logger.error(`Error downloading PDF from ${url}: ${err.message}`);
        writer.end();
        fs.unlink(tempFilePath, () => {
          reject(err);
        });
      });
    });
  } catch (error) {
    Logger.error(`Failed to fetch PDF from ${url}: ${error.message}`);
    throw error; 
  }
}

export async function processPdfToText(filePath: string, parsePDF: boolean, timeout: number): Promise<string> {
  let content = "";

  if (process.env.LLAMAPARSE_API_KEY && parsePDF) {
    Logger.debug("Processing pdf document w/ LlamaIndex");
    try {
      const reader = new LlamaParseReader({ resultType: "markdown", apiKey: process.env.LLAMAPARSE_API_KEY });
      const documents = await Promise.race([
        reader.loadData(filePath),
        new Promise((_, reject) => setTimeout(() => reject(new Error("LlamaParseReader timeout")), timeout))
      ]) as { text: string }[];
    
      if (!documents[0].text) {
        try {
          content = await processPdf(filePath);
        } catch (error) {
          Logger.error(`Failed to process PDF: ${error}`);
          content = "";
        }
      } else {
        content = documents.map(page => page.text).join("\n");
      }
    } catch (error) {
      Logger.debug("Error processing pdf document w/ LlamaIndex(2)");
      content = await processPdf(filePath);
    }
  } else if (parsePDF) {
    try {
      content = await Promise.race([
        processPdf(filePath),
        new Promise((_, reject) => setTimeout(() => reject(new Error("processPdf timeout")), timeout))
      ]);
    } catch (error) {
      Logger.error(`Failed to process PDF: ${error}`);
      content = "";
    }
  } else {
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch (error) {
      Logger.error(`Failed to read PDF file: ${error}`);
      content = "";
    }
  }
  return content;
}

async function processPdf(file: string) {
  try {
    const fileContent = fs.readFileSync(file);
    const data = await pdf(fileContent);
    return data.text;
  } catch (error) {
    throw error;
  }
}