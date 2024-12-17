import axios from "axios";
import { configDotenv } from "dotenv";
import OpenAI from "openai";

configDotenv();

type LLMProvider = 'openai' | 'ollama';

class EmbeddingError extends Error {
    constructor(message: string) {
        super(`Embedding Error: ${message}`);
    }
}

async function getOpenAIEmbedding(text: string): Promise<number[]> {
    if (!process.env.OPENAI_API_KEY) {
        throw new EmbeddingError('OpenAI API key is not configured');
    }

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const embedding = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text,
        encoding_format: "float",
    });

    return embedding.data[0].embedding;
}

async function getOllamaEmbedding(text: string): Promise<number[]> {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const model = process.env.OLLAMA_EMBEDDING_MODEL || 'llama2:latest';

    const response = await fetch(`${ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            prompt: text,
        }),
    });

    if (!response.ok) {
        throw new EmbeddingError(`Ollama API returned ${response.status}`);
    }

    const data = await response.json();
    return data.embedding;
}

async function getEmbedding(text: string): Promise<number[]> {
    const llmProvider = (process.env.LLM_PROVIDER || 'openai') as LLMProvider;

    switch (llmProvider) {
        case 'openai':
            return getOpenAIEmbedding(text);
        case 'ollama':
            return getOllamaEmbedding(text);
        default:
            throw new EmbeddingError(`Unsupported LLM provider: ${llmProvider}`);
    }
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

async function performRanking(linksWithContext: string[], links: string[], searchQuery: string) {
    try {
        // Handle invalid inputs
        if (!searchQuery || !linksWithContext.length || !links.length) {
            return [];
        }

        // Sanitize search query by removing null characters
        const sanitizedQuery = searchQuery;

        // Generate embeddings for the search query
        const queryEmbedding = await getEmbedding(sanitizedQuery);

        // Generate embeddings for each link and calculate similarity
        const linksAndScores = await Promise.all(linksWithContext.map(async (linkWithContext, index) => {
            try {
                const linkEmbedding = await getEmbedding(linkWithContext);
                const score = cosineSimilarity(queryEmbedding, linkEmbedding);
                
                return { 
                    link: links[index],
                    linkWithContext,
                    score,
                    originalIndex: index
                };
            } catch (err) {
                console.error(`Error generating embedding for link: ${err}`);
                // If embedding fails for a link, return with score 0
                return {
                    link: links[index],
                    linkWithContext,
                    score: 0,
                    originalIndex: index
                };
            }
        }));

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
