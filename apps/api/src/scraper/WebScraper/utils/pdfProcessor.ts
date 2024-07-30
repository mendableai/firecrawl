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

dotenv.config();

export async function fetchAndProcessPdf(url: string, parsePDF: boolean): Promise<{ content: string, pageStatusCode?: number, pageError?: string }> {
  try {
    const { tempFilePath, pageStatusCode, pageError } = await downloadPdf(url);
    const content = await processPdfToText(tempFilePath, parsePDF);
    fs.unlinkSync(tempFilePath); // Clean up the temporary file
    return { content, pageStatusCode, pageError };
  } catch (error) {
    Logger.error(`Failed to fetch and process PDF: ${error.message}`);
    return { content: "", pageStatusCode: 500, pageError: error.message };
  }
}

async function downloadPdf(url: string): Promise<{ tempFilePath: string, pageStatusCode?: number, pageError?: string }> {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  const tempFilePath = path.join(os.tmpdir(), `tempPdf-${Date.now()}.pdf`);
  const writer = createWriteStream(tempFilePath);

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve({ tempFilePath, pageStatusCode: response.status, pageError: response.statusText != "OK" ? response.statusText : undefined }));
    writer.on("error", reject);
  });
}

export async function processPdfToText(filePath: string, parsePDF: boolean): Promise<string> {
  let content = "";

  if (process.env.LLAMAPARSE_API_KEY && parsePDF) {
    Logger.debug("Processing pdf document w/ LlamaIndex");
    const apiKey = process.env.LLAMAPARSE_API_KEY;
    const headers = {
      Authorization: `Bearer ${apiKey}`,
    };
    const base_url = "https://api.cloud.llamaindex.ai/api/parsing";
    const fileType2 = "application/pdf";

    try {
      const formData = new FormData();
      formData.append("file", createReadStream(filePath), {
        filename: filePath,
        contentType: fileType2,
      });

      const uploadUrl = `${base_url}/upload`;
      const uploadResponse = await axios.post(uploadUrl, formData, {
        headers: {
          ...headers,
          ...formData.getHeaders(),
        },
      });

      const jobId = uploadResponse.data.id;
      const resultType = "text";
      const resultUrl = `${base_url}/job/${jobId}/result/${resultType}`;

      let resultResponse: AxiosResponse;
      let attempt = 0;
      const maxAttempts = 10; // Maximum number of attempts
      let resultAvailable = false;

      while (attempt < maxAttempts && !resultAvailable) {
        try {
          resultResponse = await axios.get(resultUrl, { headers, timeout: (axiosTimeout * 2) });
          if (resultResponse.status === 200) {
            resultAvailable = true; // Exit condition met
          } else {
            // If the status code is not 200, increment the attempt counter and wait
            attempt++;
            await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for 0.5 seconds
          }
        } catch (error) {
          Logger.debug("Error fetching result w/ LlamaIndex");
          attempt++;
          await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for 0.5 seconds before retrying
          // You may want to handle specific errors differently
        }
      }

      if (!resultAvailable) {
        content = await processPdf(filePath);
      }
      content = resultResponse.data[resultType];
    } catch (error) {
      Logger.debug("Error processing pdf document w/ LlamaIndex(2)");
      content = await processPdf(filePath);
    }
  } else if (parsePDF) {
    content = await processPdf(filePath);
  } else {
    content = fs.readFileSync(filePath, "utf-8");
  }
  return content;
}

async function processPdf(file: string) {
  const fileContent = fs.readFileSync(file);
  const data = await pdf(fileContent);
  return data.text;
}