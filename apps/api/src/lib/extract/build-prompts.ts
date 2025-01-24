export function buildRefrasedPrompt(prompt: string, url: string): string {
  return `You are a search query optimizer. Your task is to rephrase the following prompt into an effective search query that will find relevant results about this topic on ${url}.

Original prompt: "${prompt}"

Provide a rephrased search query that:
1. Maintains the core intent of the original prompt with ONLY the keywords
2. Uses relevant keywords
3. Is optimized for search engine results
4. Is concise and focused
5. Short is better than long
6. It is a search engine, not a chatbot
7. Concise

Return only the rephrased search query, without any explanation or additional text.`;
}

export function buildPreRerankPrompt(
  prompt: string | undefined,
  schema: any,
  url: string,
): string {
  const schemaString = JSON.stringify(schema, null, 2);
  return `Create a concise search query that combines the key data points from both the schema and prompt. Focus on the core information needed while keeping it general enough to find relevant matches.

Schema: ${schemaString}
Prompt: ${prompt}
Website to get content from: ${url}

Return only a concise sentece or 2 focused on the essential data points that the user wants to extract. This will be used by an LLM to determine how releavant the links that are present are to the user's request.`;
}

export function buildRerankerSystemPrompt(): string {
  return `You are a relevance expert scoring links from a website the user is trying to extract information from. Analyze the provided URLs and their content
to determine their relevance to the user's query and intent. 
    For each URL, assign a relevance score between 0 and 1, where 1
     means highly relevant and we should extract the content from it and 0 means not relevant at all, we should not extract the content from it.
      Always return all the links scored that you are giving. Do not omit links. 
     Always return the links in the same order they were provided. If the user wants the content from all the links, all links should be scored 1.`;
}

export function buildRerankerUserPrompt(searchQuery: string): string {
  return `Given these URLs, rank which ones are relevant to the user's extraction intent: "${searchQuery}".`;
}
