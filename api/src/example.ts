import { WebScraperDataProvider } from "./scraper/WebScraper";

async function example() {
  const example = new WebScraperDataProvider();

  await example.setOptions({
    jobId: "TEST",
    mode: "crawl",
    urls: ["https://mendable.ai"],
    crawlerOptions: {},
  });
  const docs = await example.getDocuments(false);
  docs.map((doc) => {
    console.log(doc.metadata.sourceURL);
  });
  console.log(docs.length);
}

// example();
