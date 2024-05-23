import { v4 as uuidv4 } from 'uuid';
import FirecrawlApp from '@mendable/firecrawl-js';

const app = new FirecrawlApp({apiKey: "YOUR_API_KEY"});

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