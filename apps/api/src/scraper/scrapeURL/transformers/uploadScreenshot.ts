// This file is an exception to the "no supabase in scrapeURL" rule,
// and it makes me sad. - mogery

import { supabase_service } from "../../../services/supabase";
import { minioService } from "../../../services/minio";
import type { Meta } from "..";
import type { Document } from "../../../controllers/v1/types";
import { randomUUID } from "node:crypto";

export function uploadScreenshot(meta: Meta, document: Document): Document {
  if (
    document.screenshot?.startsWith("data:")
  ) {
    const fileName = `screenshot-${randomUUID()}.png`;
    const buffer = Buffer.from(document.screenshot.split(",")[1], "base64");
    const contentType = document.screenshot.split(":")[1].split(";")[0];

    // Check if we should use self-hosted storage (MinIO) or Supabase
    if (process.env.USE_SELF_HOSTED_STORAGE === "true") {
      meta.logger.debug("Uploading screenshot to MinIO...");
      
      // Use async/await with try/catch for better error handling
      (async () => {
        try {
          const fileUrl = await minioService.uploadFile(
            "media",
            fileName,
            buffer,
            contentType
          );
          document.screenshot = fileUrl;
        } catch (error) {
          meta.logger.error(`Failed to upload screenshot to MinIO: ${error}`);
          // Keep the data URI if upload fails
        }
      })();
    } else if (process.env.USE_DB_AUTHENTICATION === "true") {
      meta.logger.debug("Uploading screenshot to Supabase...");

      supabase_service.storage
        .from("media")
        .upload(
          fileName,
          buffer,
          {
            cacheControl: "3600",
            upsert: false,
            contentType,
          },
        );

      document.screenshot = `https://service.firecrawl.dev/storage/v1/object/public/media/${encodeURIComponent(fileName)}`;
    }
  }

  return document;
}
