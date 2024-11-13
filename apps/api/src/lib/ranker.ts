import axios from 'axios';
import { configDotenv } from 'dotenv';
import OpenAI from "openai";

configDotenv();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getEmbedding(text: string) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
    encoding_format: "float",
  });

  return embedding.data[0].embedding;
}

const cosineSimilarity = (vec1: number[], vec2: number[]): number => {
  const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
  const magnitude1 = Math.sqrt(
    vec1.reduce((sum, val) => sum + val * val, 0)
  );
  const magnitude2 = Math.sqrt(
    vec2.reduce((sum, val) => sum + val * val, 0)
  );
  if (magnitude1 === 0 || magnitude2 === 0) return 0;
  return dotProduct / (magnitude1 * magnitude2);
};

// Function to convert text to vector
const textToVector = (searchQuery: string, text: string): number[] => {
  const words = searchQuery.toLowerCase().split(/\W+/);
  return words.map((word) => {
    const count = (text.toLowerCase().match(new RegExp(word, "g")) || [])
      .length;
    return count / text.length;
  });
};

async function performRanking(links: string[], searchQuery: string) {
  try {
    // Generate embeddings for the search query
    const queryEmbedding = await getEmbedding(searchQuery);

    // Generate embeddings for each link and calculate similarity
    const linksAndScores = await Promise.all(links.map(async (link) => {
      const linkEmbedding = await getEmbedding(link);

      // console.log("linkEmbedding", linkEmbedding);
      // const linkVector = textToVector(searchQuery, link);
      const score = cosineSimilarity(queryEmbedding, linkEmbedding);
      // console.log("score", score);
      return { link, score };
    }));

    // Sort links based on similarity scores
    linksAndScores.sort((a, b) => b.score - a.score);

    return linksAndScores;
  } catch (error) {
    console.error(`Error performing semantic search: ${error}`);
    return [];
  }
}

export { performRanking };
