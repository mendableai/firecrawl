import FirecrawlApp, { ScrapeResponseV0, CrawlStatusResponseV0, SearchResponseV0 } from './firecrawl/src/index' //'@mendable/firecrawl-js';
import { z } from "zod";

const app = new FirecrawlApp<"v0">({apiKey: "fc-YOUR_API_KEY", version: "v0"})

// Scrape a website:
const scrapeResult = await app.scrapeUrl('firecrawl.dev');

if (scrapeResult.data) {
  console.log(scrapeResult.data.content)
}

// Crawl a website:
const crawlResult = await app.crawlUrl('mendable.ai', {crawlerOptions: {excludes: ['blog/*'], limit: 5}}, false);
console.log(crawlResult)

const jobId: string = await crawlResult['jobId'];
console.log(jobId);

let job: CrawlStatusResponseV0;
while (true) {
  job = await app.checkCrawlStatus(jobId) as CrawlStatusResponseV0;
  if (job.status === 'completed') {
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 1000)); // wait 1 second
}

if (job.data) {
  console.log(job.data[0].content);
}

// Search for a query:
const query = 'what is mendable?'
const searchResult = await app.search(query) as SearchResponseV0;
if (searchResult.data) {
  console.log(searchResult.data[0].content)
}

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

let llmExtractionResult = await app.scrapeUrl("https://news.ycombinator.com");

if (llmExtractionResult.data) {
  console.log(llmExtractionResult.data[0].llm_extraction);
}

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

if (llmExtractionResult.data) {
  console.log(llmExtractionResult.data[0].llm_extraction);
}

