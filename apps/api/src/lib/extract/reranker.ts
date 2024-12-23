import { CohereClient } from "cohere-ai";
import { MapDocument } from "../../controllers/v1/types";
const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

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
