import { Pinecone } from "@pinecone-database/pinecone";
import { Document } from "../../../controllers/v1/types";
import { logger } from "../../logger";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? "";

const MAX_METADATA_SIZE = 30 * 1024; // 30KB in bytes

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

async function getEmbedding(text: string) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    encoding_format: "float",
  });

  return embedding.data[0].embedding;
}

function normalizeUrl(url: string) {
  const urlO = new URL(url);
  if (!urlO.hostname.startsWith("www.")) {
    urlO.hostname = "www." + urlO.hostname;
  }
  return urlO.href;
}

export async function indexPage({
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
    const index = pinecone.index(INDEX_NAME);

    // Trim markdown if it's too long
    let trimmedMarkdown = document.markdown;
    if (
      trimmedMarkdown &&
      Buffer.byteLength(trimmedMarkdown, "utf-8") > MAX_METADATA_SIZE
    ) {
      trimmedMarkdown = trimmedMarkdown.slice(
        0,
        Math.floor(MAX_METADATA_SIZE / 2),
      ); // Using half the size to be safe with UTF-8 encoding
    }

    // Create text to embed
    const textToEmbed = [
      document.metadata.title,
      document.metadata.description,
      trimmedMarkdown,
    ]
      .filter(Boolean)
      .join("\n\n");

    // Get embedding from OpenAI
    const embedding = await getEmbedding(textToEmbed);

    const normalizedUrl = normalizeUrl(
      document.metadata.sourceURL || document.metadata.url!,
    );

    // Prepare metadata
    const metadata: PageMetadata = {
      url: normalizedUrl,
      originUrl: normalizeUrl(originUrl),
      title: document.metadata.title ?? document.metadata.ogTitle ?? "",
      description:
        document.metadata.description ?? document.metadata.ogDescription ?? "",
      crawlId,
      teamId,
      markdown: trimmedMarkdown,
      timestamp: Date.now(),
    };

    // Upsert to Pinecone
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

export async function searchSimilarPages(
  query: string,
  originUrl?: string,
  limit: number = 1000,
): Promise<any[]> {
  try {
    const index = pinecone.index(INDEX_NAME);

    // Get query embedding from OpenAI
    const queryEmbedding = await getEmbedding(query);

    const queryParams: any = {
      vector: queryEmbedding,
      topK: limit,
      includeMetadata: true,
    };

    const normalizedOriginUrl = originUrl ? normalizeUrl(originUrl) : undefined;
    // Add filter if originUrl is provided
    if (normalizedOriginUrl) {
      queryParams.filter = {
        originUrl: { $eq: normalizedOriginUrl },
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
