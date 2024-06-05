// import { scrapWithFireEngine } from "../../src/scraper/WebScraper/single_url";

// const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// const scrapInBatches = async (
//   urls: string[],
//   batchSize: number,
//   delayMs: number
// ) => {
//   let successCount = 0;
//   let errorCount = 0;

//   for (let i = 0; i < urls.length; i += batchSize) {
//     const batch = urls
//       .slice(i, i + batchSize)
//       .map((url) => scrapWithFireEngine(url));
//     try {
//       const results = await Promise.all(batch);
//       results.forEach((data, index) => {
//         if (data.trim() === "") {
//           errorCount++;
//         } else {
//           successCount++;
//           console.log(
//             `Scraping result ${i + index + 1}:`,
//             data.trim().substring(0, 20) + "..."
//           );
//         }
//       });
//     } catch (error) {
//       console.error("Error during scraping:", error);
//     }
//     await delay(delayMs);
//   }

//   console.log(`Total successful scrapes: ${successCount}`);
//   console.log(`Total errored scrapes: ${errorCount}`);
// };
// function run() {
//   const urls = Array.from({ length: 200 }, () => "https://scrapethissite.com");
//   scrapInBatches(urls, 10, 1000);
// }
