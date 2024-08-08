import { v4 as uuidv4 } from 'uuid';
import FirecrawlApp from '@mendable/firecrawl-js';
import { z } from "zod";

const app = new FirecrawlApp({apiKey: "fc-YOUR_API_KEY"});

// Scrape a website:
const scrapeResult = await app.scrapeUrl('firecrawl.dev');
console.log(scrapeResult.data.content)

// Crawl a website:
const idempotencyKey = uuidv4(); // optional
const crawlResult = await app.crawlUrl('mendable.ai', {crawlerOptions: {excludes: ['blog/*'], limit: 5}}, false, 2, idempotencyKey);
console.log(crawlResult)

const jobId = await crawlResult['jobId'];
console.log(jobId);

let job;
while (true) {
  job = await app.checkCrawlStatus(jobId);
  if (job.status == 'completed') {
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 1000)); // wait 1 second
}

console.log(job.data[0].content);

// Search for a query:
const query = 'what is mendable?'
const searchResult = await app.search(query)
console.log(searchResult)

// LLM Extraction:
//  Define schema to extract contents into using zod schema
const zodSchema = z.object({
  top: z
    .array(
      z.object({
        title: z.string(),
        points: z.number(),
        by: z.string(),
        commentsURL: z.string(),
      })
    )
    .length(5)
    .describe("Top 5 stories on Hacker News"),
});

let llmExtractionResult = await app.scrapeUrl("https://news.ycombinator.com", {
  extractorOptions: { extractionSchema: zodSchema },
});

console.log(llmExtractionResult.data.llm_extraction);

// Define schema to extract contents into using json schema
const jsonSchema = {
  "type": "object",
  "properties": {
    "top": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": {"type": "string"},
          "points": {"type": "number"},
          "by": {"type": "string"},
          "commentsURL": {"type": "string"}
        },
        "required": ["title", "points", "by", "commentsURL"]
      },
      "minItems": 5,
      "maxItems": 5,
      "description": "Top 5 stories on Hacker News"
    }
  },
  "required": ["top"]
}

llmExtractionResult = await app.scrapeUrl("https://news.ycombinator.com", {
  extractorOptions: { extractionSchema: jsonSchema },
});

console.log(llmExtractionResult.data.llm_extraction);