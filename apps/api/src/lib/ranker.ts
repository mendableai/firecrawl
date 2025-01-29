import axios from "axios";
import { configDotenv } from "dotenv";
import OpenAI from "openai";

configDotenv();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getEmbedding(text: string) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    encoding_format: "float",
  });

  return embedding.data[0].embedding;
}

export const cosineSimilarity = (vec1: number[], vec2: number[]): number => {
  const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
  const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
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

async function performRanking(
  linksWithContext: string[],
  links: string[],
  searchQuery: string,
) {
  try {
    // Handle invalid inputs
    if (!searchQuery || !linksWithContext.length || !links.length) {
      return [];
    }

    // Sanitize search query by removing null characters
    const sanitizedQuery = searchQuery;

    // Generate embeddings for the search query
    const queryEmbedding = await getEmbedding(sanitizedQuery);

    // Generate embeddings for each link and calculate similarity in parallel
    const linksAndScores = await Promise.all(
      linksWithContext.map((linkWithContext, index) =>
        getEmbedding(linkWithContext)
          .then((linkEmbedding) => {
            const score = cosineSimilarity(queryEmbedding, linkEmbedding);
            return {
              link: links[index],
              linkWithContext,
              score,
              originalIndex: index,
            };
          })
          .catch(() => ({
            link: links[index],
            linkWithContext,
            score: 0,
            originalIndex: index,
          })),
      ),
    );

    // Sort links based on similarity scores while preserving original order for equal scores
    linksAndScores.sort((a, b) => {
      const scoreDiff = b.score - a.score;
      return scoreDiff === 0 ? a.originalIndex - b.originalIndex : scoreDiff;
    });

    return linksAndScores;
  } catch (error) {
    console.error(`Error performing semantic search: ${error}`);
    return [];
  }
}

export { performRanking };


//
// 3. (Optional) LLM-based verification for borderline cases
//
async function verifyDuplicatesUsingLLM(recordA: any, recordB: any, similarityScore: number): Promise<boolean> {
  // Convert records to strings
  const strA = JSON.stringify(recordA, null, 2);
  const strB = JSON.stringify(recordB, null, 2);

  // Use a Chat model (e.g., gpt-3.5-turbo) to verify
  // The prompt is carefully structured to get a Yes/No answer.
  // You can refine the system/user instructions to meet your needs.
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content:
          "You are a system that determines if two JSON objects could possibly represent the same entity."
      },
      {
        role: "user",
        content: `Here are two JSON records:\n\nRecord A:\n${strA}\n\nRecord B:\n${strB}\n\nHow likely are these two records to represent the same entity? Here was the embedding similarity score: ${similarityScore}. Do they represent the same entity? Answer only YES or NO.`
      },
    ],
    temperature: 0,
    max_tokens: 10,
  });

  const answer = response.choices[0]?.message?.content?.toLowerCase() || "";
  // Simple check: if the answer string contains "yes", assume it's a match; otherwise no.
  return answer.includes("yes");
}

//
// 4. Field-aware merging of duplicate records
//
//  - If a key is present in only one record, we add it.
//  - If it's present in multiple, we pick a "best" value. For demonstration:
//    * Non-null over null
//    * For strings: pick the longest
//    * For arrays: combine them (unique items). 
//    * For objects: do a nested merge (recursive).
//    * For numbers/dates: pick the earliest date or the larger number, etc.—up to you!
//
export function mergeRecords(records: any[]): any {
  // If only one record, just return it.
  if (records.length === 1) return records[0];

  // Start with an empty object and merge
  const merged: any = {};

  for (const rec of records) {
    // Skip if record is null/undefined
    if (!rec) continue;
    
    for (const [key, value] of Object.entries(rec)) {
      const existing = merged[key];

      // If not set, just take it
      if (existing === undefined) {
        merged[key] = value;
        continue;
      }

      // If one is null/undefined, take the other
      if (existing == null && value != null) {
        merged[key] = value;
        continue;
      }

      // If both are non-null, let's do some "intelligent" merging:
      if (typeof existing === "string" && typeof value === "string") {
        // For descriptions and text fields, keep the longer one
        merged[key] = value.length > existing.length ? value : existing;
      } else if (Array.isArray(existing) && Array.isArray(value)) {
        // Combine arrays and remove duplicates, preserving order
        merged[key] = [...new Set([...existing, ...value])];
      } else if (
        typeof existing === "object" &&
        !Array.isArray(existing) &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        // Nested object merge
        merged[key] = mergeRecords([existing, value]);
      } else if (typeof existing === "number" && typeof value === "number") {
        // For numbers, take the larger value
        merged[key] = Math.max(existing, value);
      } else {
        // For other cases, prefer non-null values
        merged[key] = value ?? existing;
      }
    }
  }

  return merged;
}

//
// 5. Main deduplication function
//
export async function deduplicateRecords(
  records: any[],
  thresholdLow: number = 0.80,
  thresholdHigh: number = 0.90
): Promise<any[]> {
  if (!records || records.length === 0) return [];

  // 5.1 Flatten each record to string
  const flattenedStrings = records.map((r) => JSON.stringify(r));

  // 5.2 Get embeddings in parallel
  const embeddings = await Promise.all(flattenedStrings.map(getEmbedding));

  // 5.3 Wrap items with cluster info
  type ItemType = {
    record: any;
    embedding: number[];
    clusterId: number; // -1 if unassigned
  };

  const items: ItemType[] = embeddings.map((emb, i) => ({
    record: records[i],
    embedding: emb,
    clusterId: -1,
  }));

  let currentClusterId = 0;

  // 5.4 Naive "clustering" by comparing each to each
  for (let i = 0; i < items.length; i++) {
    if (items[i].clusterId !== -1) continue; // already assigned a cluster

    // Assign new cluster
    items[i].clusterId = currentClusterId;

    // Compare with subsequent items in parallel
    const comparisons = items.slice(i + 1).map(async (item, idx) => {
      const j = i + 1 + idx;
      if (item.clusterId === -1) {
        const sim = cosineSimilarity(items[i].embedding, item.embedding);
        // Decide how to handle borderline
        if (sim >= thresholdHigh) {
          // Definitely duplicates
          return { index: j, isDuplicate: true };
        } else if (sim >= thresholdLow && sim < thresholdHigh) {
          // Borderline -> Let LLM decide
          const areDuplicates = await verifyDuplicatesUsingLLM(
            items[i].record,
            item.record,
            sim
          );
          // console.log(`Similarity between ${i} and ${j}: ${sim}`);
          // console.log(`Are duplicates: ${areDuplicates}`);
          if (areDuplicates) {
            return { index: j, isDuplicate: true };
          }
        }
        // sim < thresholdLow -> definitely not duplicates
      }
      return { index: j, isDuplicate: false };
    });

    // Wait for all comparisons and update cluster IDs
    const results = await Promise.all(comparisons);
    results.forEach(({ index, isDuplicate }) => {
      if (isDuplicate) {
        items[index].clusterId = currentClusterId;
      }
    });

    currentClusterId++;
  }

  // 5.5 Group by cluster
  const clusters: Record<number, ItemType[]> = {};
  for (const it of items) {
    if (!clusters[it.clusterId]) {
      clusters[it.clusterId] = [];
    }
    clusters[it.clusterId].push(it);
  }

  // 5.6 Merge records in each cluster using custom logic
  const deduplicated: any[] = [];
  for (const cid of Object.keys(clusters)) {
    const clusterIdNum = Number(cid);
    const clusterItems = clusters[clusterIdNum];
    // Extract raw records
    const rawRecords = clusterItems.map((it) => it.record);
    // Merge them
    const merged = mergeRecords(rawRecords);
    deduplicated.push(merged);
  }

  return deduplicated;
}

// 
// 6. Example usage
//
// (async () => {
//   const inputRecords = [
//     { name: "Jack Thug", description: "it is a greeting", date: null },
//     { name: "Jack Thug James", description: "it is a greeting", date: null },
//     { title: "Something else", random: 123 },
//     { title: "Something else", random: 123 },
//     {
//       name: "Some Person",
//       description: "He is a developer",
//       hobbies: ["coding", "gaming"],
//     },
//     {
//       name: "Some Person",
//       description: "He is a dev",
//       hobbies: ["coding"],
//       city: "NYC",
//     },
//   ];

//   console.log("Starting deduplication...");
//   // Lower the thresholds to catch more similar items
//   const result = await deduplicateRecords(inputRecords, 0.70, 0.85);
//   console.log("Deduplicated results:");
//   console.dir(result, { depth: null });
// })();


