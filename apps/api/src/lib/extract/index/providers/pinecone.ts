import { PagesIndex, PageMetadata } from "./vectordb";
import { Pinecone as PineconeDB } from "@pinecone-database/pinecone";
import { logger } from "../../../logger";
import { Document } from "../../../../controllers/v1/types";

const INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? "";

export class Pinecone extends PagesIndex {
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
      const pinecone = new PineconeDB({
        apiKey: process.env.PINECONE_API_KEY!,
      });

      const index = pinecone.index(INDEX_NAME);

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

      await index.upsert([
        {
          id: normalizedUrl,
          values: embedding,
          metadata: {
            ...metadata,
            [document.metadata.sourceURL || document.metadata.url!]: true,
          },
        },
      ]);

      logger.debug("Successfully indexed page in Pinecone", {
        url: metadata.url,
        crawlId,
      });
    } catch (error) {
      logger.error("Failed to index page in Pinecone", {
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
      const pinecone = new PineconeDB({
        apiKey: process.env.PINECONE_API_KEY!,
      });

      const index = pinecone.index(INDEX_NAME);
      const queryEmbedding = await this.getEmbedding(query);

      const queryParams: any = {
        vector: queryEmbedding,
        topK: limit,
        includeMetadata: true,
      };

      if (originUrl) {
        queryParams.filter = {
          originUrl: { $eq: this.normalizeUrl(originUrl) },
        };
      }

      const results = await index.query(queryParams);
      return results.matches.map((match) => ({
        url: match.metadata?.url,
        title: match.metadata?.title,
        description: match.metadata?.description,
        score: match.score,
        markdown: match.metadata?.markdown,
      }));
    } catch (error) {
      logger.error("Failed to search similar pages in Pinecone", {
        error,
        query,
        originUrl,
      });
      return [];
    }
  }
}
