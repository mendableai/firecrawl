import { MapDocument, URLTrace } from "../../controllers/v1/types";
import { performRanking } from "../ranker";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist";
import { logger } from "../logger";
import { CohereClient } from "cohere-ai";
import { extractConfig } from "./config";
import { searchSimilarPages } from "./index/pinecone";
import { generateOpenAICompletions } from "../../scraper/scrapeURL/transformers/llmExtract";

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

interface RankingResult {
  mappedLinks: MapDocument[];
  linksAndScores: {
    link: string;
    linkWithContext: string;
    score: number;
    originalIndex: number;
  }[];
}

export async function rerankDocuments(
  documents: (string | Record<string, string>)[],
  query: string,
  topN = 3,
  model = "rerank-english-v3.0",
) {
  const rerank = await cohere.v2.rerank({
    documents,
    query,
    topN,
    model,
    returnDocuments: true,
  });

  return rerank.results
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .map((x) => ({
      document: x.document,
      index: x.index,
      relevanceScore: x.relevanceScore,
    }));
}

export async function rerankLinks(
  mappedLinks: MapDocument[],
  searchQuery: string,
  urlTraces: URLTrace[],
): Promise<MapDocument[]> {
  // console.log("Going to rerank links");
  const mappedLinksRerank = mappedLinks.map(
    (x) => `url: ${x.url}, title: ${x.title}, description: ${x.description}`,
  );

  const linksAndScores = await performRanking(
    mappedLinksRerank,
    mappedLinks.map((l) => l.url),
    searchQuery
  );

  // First try with high threshold
  let filteredLinks = filterAndProcessLinks(
    mappedLinks,
    linksAndScores,
    extractConfig.RERANKING.INITIAL_SCORE_THRESHOLD_FOR_RELEVANCE,
  );

  // If we don't have enough high-quality links, try with lower threshold
  if (filteredLinks.length < extractConfig.RERANKING.MIN_REQUIRED_LINKS) {
    logger.info(
      `Only found ${filteredLinks.length} links with score > ${extractConfig.RERANKING.INITIAL_SCORE_THRESHOLD_FOR_RELEVANCE}. Trying lower threshold...`,
    );
    filteredLinks = filterAndProcessLinks(
      mappedLinks,
      linksAndScores,
      extractConfig.RERANKING.FALLBACK_SCORE_THRESHOLD_FOR_RELEVANCE,
    );

    if (filteredLinks.length === 0) {
      // If still no results, take top N results regardless of score
      logger.warn(
        `No links found with score > ${extractConfig.RERANKING.FALLBACK_SCORE_THRESHOLD_FOR_RELEVANCE}. Taking top ${extractConfig.RERANKING.MIN_REQUIRED_LINKS} results.`,
      );
      filteredLinks = linksAndScores
        .sort((a, b) => b.score - a.score)
        .slice(0, extractConfig.RERANKING.MIN_REQUIRED_LINKS)
        .map((x) => mappedLinks.find((link) => link.url === x.link))
        .filter(
          (x): x is MapDocument =>
            x !== undefined && x.url !== undefined && !isUrlBlocked(x.url),
        );
    }
  }

  // Update URL traces with relevance scores and mark filtered out URLs
  linksAndScores.forEach((score) => {
    const trace = urlTraces.find((t) => t.url === score.link);
    if (trace) {
      trace.relevanceScore = score.score;
      // If URL didn't make it through filtering, mark it as filtered out
      if (!filteredLinks.some((link) => link.url === score.link)) {
        trace.warning = `Relevance score ${score.score} below threshold`;
        trace.usedInCompletion = false;
      }
    }
  });

  const rankedLinks = filteredLinks.slice(0, extractConfig.RERANKING.MAX_RANKING_LIMIT_FOR_RELEVANCE);
  
  // Mark URLs that will be used in completion
  rankedLinks.forEach((link) => {
    const trace = urlTraces.find((t) => t.url === link.url);
    if (trace) {
      trace.usedInCompletion = true;
    }
  });

  // Mark URLs that were dropped due to ranking limit
  filteredLinks.slice(extractConfig.RERANKING.MAX_RANKING_LIMIT_FOR_RELEVANCE).forEach(link => {
    const trace = urlTraces.find(t => t.url === link.url);
    if (trace) {
      trace.warning = "Excluded due to ranking limit";
      trace.usedInCompletion = false;
    }
  });

  // console.log("Reranked links: ", rankedLinks.length);

  return rankedLinks;
}

function filterAndProcessLinks(
  mappedLinks: MapDocument[],
  linksAndScores: {
    link: string;
    linkWithContext: string;
    score: number;
    originalIndex: number;
  }[],
  threshold: number,
): MapDocument[] {
  return linksAndScores
    .filter((x) => x.score > threshold)
    .map((x) => mappedLinks.find((link) => link.url === x.link))
    .filter(
      (x): x is MapDocument =>
        x !== undefined && x.url !== undefined && !isUrlBlocked(x.url),
    );
}


export async function rerankLinksWithLLM(
  mappedLinks: MapDocument[],
  searchQuery: string,
  urlTraces: URLTrace[],
): Promise<MapDocument[]> {
  const chunkSize = 100;
  const chunks: MapDocument[][] = [];
  const TIMEOUT_MS = 20000;
  const MAX_RETRIES = 2;
  
  // Split mappedLinks into chunks of 200
  for (let i = 0; i < mappedLinks.length; i += chunkSize) {
    chunks.push(mappedLinks.slice(i, i + chunkSize));
  }

  // console.log(`Total links: ${mappedLinks.length}, Number of chunks: ${chunks.length}`);

  const schema = {
    type: "object",
    properties: {
      relevantLinks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string" },
            relevanceScore: { type: "number" }
          },
          required: ["url", "relevanceScore"]
        }
      }
    },
    required: ["relevantLinks"]
  };

  const results = await Promise.all(
    chunks.map(async (chunk, chunkIndex) => {
      // console.log(`Processing chunk ${chunkIndex + 1}/${chunks.length} with ${chunk.length} links`);
      
      const linksContent = chunk.map(link => 
        `URL: ${link.url}${link.title ? `\nTitle: ${link.title}` : ''}${link.description ? `\nDescription: ${link.description}` : ''}`
      ).join("\n\n");

      for (let retry = 0; retry <= MAX_RETRIES; retry++) {
        try {
          const timeoutPromise = new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), TIMEOUT_MS);
          });

          const completionPromise = generateOpenAICompletions(
            logger.child({ method: "rerankLinksWithLLM", chunk: chunkIndex + 1, retry }),
            {
              mode: "llm",
              systemPrompt: "You are a search relevance expert. Analyze the provided URLs and their content to determine their relevance to the search query. For each URL, assign a relevance score between 0 and 1, where 1 means highly relevant and 0 means not relevant at all. Only include URLs that are actually relevant to the query.",
              prompt: `Given these URLs and their content, identify which ones are relevant to the search query: "${searchQuery}". Return an array of relevant links with their relevance scores (0-1). Higher scores should be given to URLs that directly address the search query. Be very mindful with the links you select, as if they are not that relevant it may affect the quality of the extraction. Only include URLs that have a relvancy score of 0.8+.`,
              schema: schema
            },
            linksContent,
            undefined,
            true
          );

          const completion = await Promise.race([completionPromise, timeoutPromise]);
          
          if (!completion) {
            // console.log(`Chunk ${chunkIndex + 1}: Timeout on attempt ${retry + 1}`);
            continue;
          }

          if (!completion.extract?.relevantLinks) {
            // console.warn(`Chunk ${chunkIndex + 1}: No relevant links found in completion response`);
            return [];
          }

          // console.log(`Chunk ${chunkIndex + 1}: Found ${completion.extract.relevantLinks.length} relevant links`);
          return completion.extract.relevantLinks;

        } catch (error) {
          console.warn(`Error processing chunk ${chunkIndex + 1} attempt ${retry + 1}:`, error);
          if (retry === MAX_RETRIES) {
            // console.log(`Chunk ${chunkIndex + 1}: Max retries reached, returning empty array`);
            return [];
          }
        }
      }
      return [];
    })
  );

  // console.log(`Processed ${results.length} chunks`);

  // Flatten results and sort by relevance score
  const flattenedResults = results.flat().sort((a, b) => b.relevanceScore - a.relevanceScore);
  // console.log(`Total relevant links found: ${flattenedResults.length}`);

  // Map back to MapDocument format, keeping only relevant links
  const relevantLinks = flattenedResults
    .map(result => mappedLinks.find(link => link.url === result.url))
    .filter((link): link is MapDocument => link !== undefined);

  // console.log(`Returning ${relevantLinks.length} relevant links`);
  return relevantLinks;
}