import { PagesIndex, PageMetadata } from "./vectordb";
import { QdrantClient } from "@qdrant/js-client-rest";
import { logger } from "../../../logger";
import { v5 as uuidv5 } from "uuid";
import { Document } from "../../../../controllers/v1/types";

const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
});
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME ?? "firecrawl";

export class Qdrant extends PagesIndex {
  async indexPage({
    document,
    originUrl,
    crawlId,
    teamId,
  }: {
    document: Document;
    originUrl: string;
    crawlId?: string;
    teamId?: string;
  }) {
    try {
      const textToEmbed = this.prepareTextForEmbedding(document);
      const embedding = await this.getEmbedding(textToEmbed);
      const normalizedUrl = this.normalizeUrl(
        document.metadata.sourceURL || document.metadata.url!,
      );

      const metadata: PageMetadata = {
        url: normalizedUrl,
        originUrl: this.normalizeUrl(originUrl),
        title: document.metadata.title,
        description: document.metadata.description,
        crawlId,
        teamId,
        markdown: document.markdown,
        timestamp: Date.now(),
      };

      if (!(await qdrantClient.collectionExists(COLLECTION_NAME)).exists) {
        await qdrantClient.createCollection(COLLECTION_NAME, {
          vectors: {
            size: embedding.length,
            distance: "Cosine",
          },
        });
      }
      await qdrantClient.upsert(COLLECTION_NAME, {
        points: [
          {
            id: uuidv5(normalizedUrl, uuidv5.URL),
            vector: embedding,
            payload: {
              ...metadata,
              [document.metadata.sourceURL || document.metadata.url!]: true,
            },
          },
        ],
      });

      logger.debug("Successfully indexed page in Qdrant", {
        url: metadata.url,
        crawlId,
      });
    } catch (error) {
      logger.error("Failed to index page in Qdrant", {
        error,
        url: document.metadata.sourceURL || document.metadata.url,
        crawlId,
      });
    }
  }

  async searchSimilarPages(
    query: string,
    originUrl?: string,
    limit: number = 10,
  ) {
    try {
      const queryEmbedding = await this.getEmbedding(query);

      const queryParams: any = {
        query: queryEmbedding,
        limit: limit,
        with_payload: true,
      };

      if (originUrl) {
        queryParams.filter = {
          must: [
            {
              key: "originUrl",
              match: { value: this.normalizeUrl(originUrl) },
            },
          ],
        };
      }

      const results = (await qdrantClient.query(COLLECTION_NAME, queryParams))
        .points;

      return results.map((match) => ({
        url: match.payload?.url,
        title: match.payload?.title,
        description: match.payload?.description,
        score: match.score,
        markdown: match.payload?.markdown,
      }));
    } catch (error) {
      logger.error("Failed to search similar pages in Qdrant", {
        error,
        query,
        originUrl,
      });
      return [];
    }
  }
}
