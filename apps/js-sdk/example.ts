import FirecrawlApp, { ScrapeResponse } from './firecrawl/src/index' //'@mendable/firecrawl-js';
import { CrawlStatusResponse } from './firecrawl/src/index';

const app = new FirecrawlApp({apiKey: "fc-YOUR_API_KEY"});

// Scrape a website:
const scrapeResult = await app.scrapeUrl('firecrawl.dev') as ScrapeResponse;

if (scrapeResult) {
  console.log(scrapeResult.markdown)
}

// Crawl a website:
const crawlResult = await app.crawlUrl('mendable.ai', {crawlerOptions: {excludes: ['blog/*'], limit: 5}}, false);
console.log(crawlResult)

const jobId: string = await crawlResult['jobId'];
console.log(jobId);

let job: CrawlStatusResponse;
while (true) {
  job = await app.checkCrawlStatus(jobId) as CrawlStatusResponse;
  if (job.status === 'completed') {
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 1000)); // wait 1 second
}

if (job.data) {
  console.log(job.data[0].markdown);
}

const mapResult = await app.mapUrl('https://firecrawl.dev');
console.log(mapResult)
