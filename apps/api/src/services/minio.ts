import { Client } from "minio";
import { logger } from "../lib/logger";
import { configDotenv } from "dotenv";
configDotenv();

// MinioService class initializes the MinIO client for self-hosted storage
class MinioService {
  private client: Client | null = null;

  constructor() {
    const minioEndpoint = process.env.MINIO_ENDPOINT;
    const minioPort = Number.parseInt(process.env.MINIO_PORT || "9000", 10);
    const minioAccessKey = process.env.MINIO_ACCESS_KEY;
    const minioSecretKey = process.env.MINIO_SECRET_KEY;
    const minioUseSSL = process.env.MINIO_USE_SSL === "true";
    const useSelfHostedStorage = process.env.USE_SELF_HOSTED_STORAGE === "true";

    // Only initialize the MinIO client if self-hosted storage is enabled and all required variables are provided
    if (!useSelfHostedStorage) {
      logger.info("Self-hosted storage is disabled. MinIO client will not be initialized.");
      this.client = null;
    } else if (!minioEndpoint || !minioAccessKey || !minioSecretKey) {
      logger.error(
        "MinIO environment variables aren't configured correctly. MinIO client will not be initialized. Fix ENV configuration or disable self-hosted storage with USE_SELF_HOSTED_STORAGE env variable"
      );
      this.client = null;
    } else {
      this.client = new Client({
        endPoint: minioEndpoint,
        port: minioPort,
        useSSL: minioUseSSL,
        accessKey: minioAccessKey,
        secretKey: minioSecretKey,
      });

      // Create the media bucket if it doesn't exist
      this.createBucketIfNotExists("media").catch((err) => {
        logger.error(`Failed to create media bucket: ${err.message}`);
      });
    }
  }

  // Create the bucket if it doesn't exist
  private async createBucketIfNotExists(bucketName: string): Promise<void> {
    if (!this.client) return;

    try {
      const exists = await this.client.bucketExists(bucketName);
      if (!exists) {
        await this.client.makeBucket(bucketName, "us-east-1");
        logger.info(`Created bucket: ${bucketName}`);
        
        // Set the bucket policy to allow public read access
        const policy = {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: "*",
              Action: ["s3:GetObject"],
              Resource: [`arn:aws:s3:::${bucketName}/*`],
            },
          ],
        };
        
        await this.client.setBucketPolicy(bucketName, JSON.stringify(policy));
        logger.info(`Set public read policy for bucket: ${bucketName}`);
      }
    } catch (err) {
      logger.error(`Error checking/creating bucket ${bucketName}: ${err}`);
      throw err;
    }
  }

  // Upload a file to MinIO
  async uploadFile(bucketName: string, fileName: string, buffer: Buffer, contentType: string): Promise<string> {
    if (!this.client) {
      throw new Error("MinIO client is not configured.");
    }

    await this.client.putObject(bucketName, fileName, buffer, buffer.length, {
      "Content-Type": contentType,
      "Cache-Control": "max-age=3600",
    });

    // Construct the URL for the uploaded file
    const minioEndpoint = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT;
    const minioPort = process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT || "9000";
    const useSSL = process.env.MINIO_USE_SSL === "true";
    const protocol = useSSL ? "https" : "http";
    
    return `${protocol}://${minioEndpoint}:${minioPort}/${bucketName}/${encodeURIComponent(fileName)}`;
  }

  // Get the MinIO client
  getClient(): Client | null {
    return this.client;
  }
}

const minioService = new MinioService();

export { minioService };
