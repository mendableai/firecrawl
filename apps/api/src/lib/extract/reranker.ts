import { MapDocument, URLTrace } from "../../controllers/v1/types";
import { performRanking } from "../ranker";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist";
import { logger } from "../logger";
import { CohereClient } from "cohere-ai";

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

const MAX_RANKING_LIMIT = 10;
const INITIAL_SCORE_THRESHOLD = 0.75;
const FALLBACK_SCORE_THRESHOLD = 0.5;
const MIN_REQUIRED_LINKS = 1;

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
  const mappedLinksRerank = mappedLinks.map(
    (x) => `url: ${x.url}, title: ${x.title}, description: ${x.description}`,
  );

  const linksAndScores = await performRanking(
    mappedLinksRerank,
    mappedLinks.map((l) => l.url),
    searchQuery,
  );

  // First try with high threshold
  let filteredLinks = filterAndProcessLinks(
    mappedLinks,
    linksAndScores,
    INITIAL_SCORE_THRESHOLD,
  );

  // If we don't have enough high-quality links, try with lower threshold
  if (filteredLinks.length < MIN_REQUIRED_LINKS) {
    logger.info(
      `Only found ${filteredLinks.length} links with score > ${INITIAL_SCORE_THRESHOLD}. Trying lower threshold...`,
    );
    filteredLinks = filterAndProcessLinks(
      mappedLinks,
      linksAndScores,
      FALLBACK_SCORE_THRESHOLD,
    );

    if (filteredLinks.length === 0) {
      // If still no results, take top N results regardless of score
      logger.warn(
        `No links found with score > ${FALLBACK_SCORE_THRESHOLD}. Taking top ${MIN_REQUIRED_LINKS} results.`,
      );
      filteredLinks = linksAndScores
        .sort((a, b) => b.score - a.score)
        .slice(0, MIN_REQUIRED_LINKS)
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
      if (!filteredLinks.some(link => link.url === score.link)) {
        trace.warning = `Relevance score ${score.score} below threshold`;
        trace.usedInCompletion = false;
      }
    }
  });

  const rankedLinks = filteredLinks.slice(0, MAX_RANKING_LIMIT);
  
  // Mark URLs that will be used in completion
  rankedLinks.forEach(link => {
    const trace = urlTraces.find(t => t.url === link.url);
    if (trace) {
      trace.usedInCompletion = true;
    }
  });

  // Mark URLs that were dropped due to ranking limit
  filteredLinks.slice(MAX_RANKING_LIMIT).forEach(link => {
    const trace = urlTraces.find(t => t.url === link.url);
    if (trace) {
      trace.warning = 'Excluded due to ranking limit';
      trace.usedInCompletion = false;
    }
  });

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
