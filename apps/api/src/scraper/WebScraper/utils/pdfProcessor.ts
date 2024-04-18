import axios, { AxiosResponse } from "axios";
import fs from "fs";
import { createReadStream, createWriteStream } from "node:fs";
import FormData from "form-data";
import dotenv from "dotenv";
import pdf from "pdf-parse";
import path from "path";
import os from "os";

dotenv.config();

export async function fetchAndProcessPdf(url: string): Promise<string> {
  const tempFilePath = await downloadPdf(url);
  const content = await processPdfToText(tempFilePath);
  fs.unlinkSync(tempFilePath); // Clean up the temporary file
  return content;
}

async function downloadPdf(url: string): Promise<string> {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });

  const tempFilePath = path.join(os.tmpdir(), `tempPdf-${Date.now()}.pdf`);
  const writer = createWriteStream(tempFilePath);

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(tempFilePath));
    writer.on('error', reject);
  });
}

export async function processPdfToText(filePath: string): Promise<string> {
  let content = "";

  if (process.env.LLAMAPARSE_API_KEY) {
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
          resultResponse = await axios.get(resultUrl, { headers });
          if (resultResponse.status === 200) {
            resultAvailable = true; // Exit condition met
          } else {
            // If the status code is not 200, increment the attempt counter and wait
            attempt++;
            await new Promise((resolve) => setTimeout(resolve, 250)); // Wait for 2 seconds
          }
        } catch (error) {
          console.error("Error fetching result:", error);
          attempt++;
          await new Promise((resolve) => setTimeout(resolve, 250)); // Wait for 2 seconds before retrying
          // You may want to handle specific errors differently
        }
      }

      if (!resultAvailable) {
        content = await processPdf(filePath);
      }
      content = resultResponse.data[resultType];
    } catch (error) {
      console.error("Error processing document:", filePath, error);
      content = await processPdf(filePath);
    }
  } else {
    content = await processPdf(filePath);
  }
  return content;
}

async function processPdf(file: string){
  const fileContent = fs.readFileSync(file);
  const data = await pdf(fileContent);
  return data.text;
}