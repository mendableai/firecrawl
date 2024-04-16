import FirecrawlApp from '@mendable/firecrawl-js';

const app = new FirecrawlApp({apiKey: "YOUR_API_KEY"});

const crawlResult = await app.crawlUrl('mendable.ai', {crawlerOptions: {excludes: ['blog/*'], limit: 5}}, false);
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