import { Document } from "../../../../controllers/v1/types";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface PageMetadata {
  url: string;
  originUrl: string;
  title?: string;
  description?: string;
  crawlId?: string;
  teamId?: string;
  timestamp: number;
  markdown?: string;
}

export abstract class PagesIndex {
  protected static MAX_METADATA_SIZE = 30 * 1024; // 30KB in bytes

  async getEmbedding(text: string) {
    const embedding = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      input: text,
      encoding_format: "float",
    });
    return embedding.data[0].embedding;
  }

  protected prepareTextForEmbedding(document: Document) {
    let trimmedMarkdown = document.markdown;
    if (
      trimmedMarkdown &&
      Buffer.byteLength(trimmedMarkdown, "utf-8") > PagesIndex.MAX_METADATA_SIZE
    ) {
      trimmedMarkdown = trimmedMarkdown.slice(
        0,
        Math.floor(PagesIndex.MAX_METADATA_SIZE / 2),
      ); // Trim to avoid exceeding the max size
    }

    const textToEmbed = [
      document.metadata.title,
      document.metadata.description,
      trimmedMarkdown,
    ]
      .filter(Boolean)
      .join("\n\n"); // Join non-null/undefined parts with a double line break

    return textToEmbed;
  }

  protected normalizeUrl(url: string) {
    const urlO = new URL(url);
    if (!urlO.hostname.startsWith("www.")) {
      urlO.hostname = "www." + urlO.hostname;
    }
    return urlO.href;
  }

  abstract indexPage(params: {
    document: Document;
    originUrl: string;
    crawlId?: string;
    teamId?: string;
  }): Promise<void>;

  abstract searchSimilarPages(
    query: string,
    originUrl?: string,
    limit?: number,
  ): Promise<any>;
}
