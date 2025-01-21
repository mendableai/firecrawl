import { MapDocument, URLTrace } from "../../controllers/v1/types";
import { performRanking } from "../ranker";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist";
import { logger } from "../logger";
import { CohereClient } from "cohere-ai";
import { extractConfig } from "./config";
import { searchSimilarPages } from "./index/pinecone";
import { generateOpenAICompletions } from "../../scraper/scrapeURL/transformers/llmExtract";
import { dumpToFile } from "./helpers/dump-to-file";

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

export type RerankerResult = {
  mapDocument: MapDocument[];
  tokensUsed: number;
}

export async function rerankLinksWithLLM(
  mappedLinks: MapDocument[],
  searchQuery: string,
  urlTraces: URLTrace[],
  relevanceThreshold: number = 0.8
): Promise<RerankerResult> {
  const chunkSize = 100;
  const chunks: MapDocument[][] = [];
  const TIMEOUT_MS = 20000;
  const MAX_RETRIES = 2;
  let totalTokensUsed = 0;
  
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
            relevanceScore: { type: "number" },
            reason: { type: "string" }
          },
          required: ["url", "relevanceScore", "reason"]
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
              systemPrompt: `You are a search relevance expert. Your task is to analyze the provided URLs and their content to determine their relevance to the search query. For each URL, assign a relevance score between 0 and 1, where:

1 means highly relevant (content directly addresses the query).
0 means not relevant at all.
Only include URLs that meet a minimum relevance threshold of 0.5. Provide a clear reason for the assigned score based on the content and query.
`,
              prompt: `
Given these URLs and their content, identify which ones are relevant to the search query:
"${searchQuery}".

### Instructions: ###
Analyze each URL's content based on its alignment with the query.
Only include URLs with a relevance score of 0.5 or higher.
Return results as an array in the following schema:
{
  "url": "URL of the page",
  "relevanceScore": 0-1, // Relevance score with 1 being highly relevant
  "reason": "A brief explanation of the relevance score"
}
Assign scores based on the following criteria:
0.9–1.0: Highly relevant. The content directly addresses the search query with detailed information or matches the intent closely.
0.5–0.8: Moderately relevant. The content partially addresses the search query but may lack detail or specificity.
0–0.4: Irrelevant. The content does not address the search query or contains minimal alignment.
Example Input:
Search Query: Extract all the electronic gadgets listed for sale.
Site: https://example.com/electronics

### Content: ###

URL: https://example.com/electronics/laptops/dell-xps13  
Content: This page provides a detailed description of the Dell XPS 13 laptop, including specifications, price, and purchase options.  

URL: https://example.com/electronics/laptops/macbook-pro  
Content: This page features the MacBook Pro laptop, with details about configurations, pricing, and availability for purchase.  

URL: https://example.com/electronics/tutorials/how-to-choose-a-laptop  
Content: A blog post explaining how to choose the best laptop, with no direct product listings or purchase options.  

URL: https://example.com/electronics/about-us  
Content: This page provides general information about the company, its mission, and its history, with no mention of products.  

URL: https://example.com/electronics/deals  
Content: A sales page showcasing discounts on various gadgets, with links to detailed product pages.  

URL: https://example.com/electronics/reviews/top-10-laptops  
Content: A review article listing the top 10 laptops, with brief descriptions but no links to purchase.  

### Expected Output: ###
[
  {
    "url": "https://example.com/electronics/laptops/dell-xps13",
    "relevanceScore": 1.0,
    "reason": "The page provides detailed product information, including specifications, price, and purchase options, directly addressing the query."
  },
  {
    "url": "https://example.com/electronics/laptops/macbook-pro",
    "relevanceScore": 1.0,
    "reason": "The page contains detailed product information relevant to the search query."
  },
  {
    "url": "https://example.com/electronics/deals",
    "relevanceScore": 0.7,
    "reason": "The page lists multiple relevant products with links to detailed pages but lacks comprehensive product descriptions itself."
  }
]
`,
              schema: schema
            },
            linksContent,
            undefined,
            true
          );

          // await dumpToFile("links-content.txt", [linksContent], (item) => item);
          // await dumpToFile("search-query.txt", [searchQuery], (item) => item);

          const completion = await Promise.race([completionPromise, timeoutPromise]);
          
          if (!completion) {
            // console.log(`Chunk ${chunkIndex + 1}: Timeout on attempt ${retry + 1}`);
            continue;
          }

          if (!completion.extract?.relevantLinks) {
            // console.warn(`Chunk ${chunkIndex + 1}: No relevant links found in completion response`);
            return [];
          }

          totalTokensUsed += completion.numTokens || 0;
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
  
  // Filter out links below relevance threshold
  const filteredResults = flattenedResults.filter((a) => a.relevanceScore >= relevanceThreshold);

  // Map back to MapDocument format, keeping only relevant links
  const relevantLinks = filteredResults 
    .map(result => mappedLinks.find(link => link.url === result.url))
    .filter((link): link is MapDocument => link !== undefined);

  // console.log(`Returning ${relevantLinks.length} relevant links`);
  return {
    mapDocument: relevantLinks,
    tokensUsed: totalTokensUsed,
  };
}
