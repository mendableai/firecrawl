import FirecrawlApp from 'firecrawl';
import { z } from 'zod';

const app = new FirecrawlApp({apiKey: "fc-YOUR_API_KEY"});

const main = async () => {

  // Scrape a website:
  const scrapeResult = await app.scrapeUrl('firecrawl.dev');

  if (scrapeResult.success) {
    console.log(scrapeResult.markdown)
  }

  // Crawl a website:
  const crawlResult = await app.crawlUrl('mendable.ai', { excludePaths: ['blog/*'], limit: 5});
  console.log(crawlResult);

  // Asynchronously crawl a website:
  const asyncCrawlResult = await app.asyncCrawlUrl('mendable.ai', { excludePaths: ['blog/*'], limit: 5});
  
  if (asyncCrawlResult.success) {
    const id = asyncCrawlResult.id;
    console.log(id);

    let checkStatus;
    if (asyncCrawlResult.success) {
      while (true) {
        checkStatus = await app.checkCrawlStatus(id);
        if (checkStatus.success && checkStatus.status === 'completed') {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // wait 1 second
      }

      if (checkStatus.success && checkStatus.data) {
        console.log(checkStatus.data[0].markdown);
      }
    }
  }

  // Map a website:
  const mapResult = await app.mapUrl('https://firecrawl.dev');
  console.log(mapResult)

  // Extract information from a website using LLM:
  const extractSchema = z.object({
    title: z.string(),
    description: z.string(),
    links: z.array(z.string())
  });

  const extractResult = await app.extract(['https://firecrawl.dev'], {
    prompt: "Extract the title, description, and links from the website",
    schema: extractSchema
  });
  console.log(extractResult);

  // Crawl a website with WebSockets:
  const watch = await app.crawlUrlAndWatch('mendable.ai', { excludePaths: ['blog/*'], limit: 5});

  watch.addEventListener("document", doc => {
    console.log("DOC", doc.detail);
  });

  watch.addEventListener("error", err => {
    console.error("ERR", err.detail.error);
  });

  watch.addEventListener("done", state => {
    console.log("DONE", state.detail.status);
  });
}

main()
