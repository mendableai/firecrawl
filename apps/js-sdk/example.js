import FirecrawlApp from './firecrawl/src/index'; //'@mendable/firecrawl-js';

const app = new FirecrawlApp({apiKey: "fc-YOUR_API_KEY"});

// Scrape a website:
const scrapeResult = await app.scrapeUrl('firecrawl.dev');

if (scrapeResult.data) {
  console.log(scrapeResult.data.markdown)
}

// Crawl a website:
const crawlResult = await app.crawlUrl('mendable.ai', {crawlerOptions: {excludes: ['blog/*'], limit: 5}}, false);
console.log(crawlResult)

const jobId = await crawlResult['jobId'];
console.log(jobId);

let job;
while (true) {
  job = await app.checkCrawlStatus(jobId);
  if (job.status === 'completed') {
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 1000)); // wait 1 second
}

if (job.data) {
  console.log(job.data[0].markdown);
}

const mapResult = await app.map('https://firecrawl.dev');
console.log(mapResult)
