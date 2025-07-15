// const id = crypto.randomUUID();

// const sc: StoredCrawl = {
//   originUrl: request.urls[0].replace("/*",""),
//   crawlerOptions: toLegacyCrawlerOptions({
//     maxDepth: 15,
//     limit: 5000,
//     includePaths: [],
//     excludePaths: [],
//     ignoreSitemap: false,
//     allowExternalLinks: false,
//     allowBackwardLinks: true,
//     allowSubdomains: false,
//     ignoreRobotsTxt: false,
//     deduplicateSimilarURLs: false,
//     ignoreQueryParameters: false
//   }),
//   scrapeOptions: {
//       formats: ["markdown"],
//       onlyMainContent: true,
//       waitFor: 0,
//       mobile: false,
//       removeBase64Images: true,
//       fastMode: false,
//       parsePDF: true,
//       skipTlsVerification: false,
//   },
//   internalOptions: {
//     disableSmartWaitCache: true,
//     isBackgroundIndex: true
//   },
//   team_id: process.env.BACKGROUND_INDEX_TEAM_ID!,
//   createdAt: Date.now(),
//   plan: "hobby", // make it a low concurrency
// };

// // Save the crawl configuration
// await saveCrawl(id, sc);

// // Then kick off the job
// await _addScrapeJobToBullMQ({
//   url: request.urls[0].replace("/*",""),
//   mode: "kickoff" as const,
//   team_id: process.env.BACKGROUND_INDEX_TEAM_ID!,
//   plan: "hobby", // make it a low concurrency
//   crawlerOptions: sc.crawlerOptions,
//   scrapeOptions: sc.scrapeOptions,
//   internalOptions: sc.internalOptions,
//   origin: "index",
//   crawl_id: id,
//   webhook: null,
//   v1: true,
// }, {}, crypto.randomUUID(), 50);

// we restructure and make all of the arrays we need to fill into objects,
// adding them to a single object so the llm can fill them one at a time
// TODO: make this work for more complex schemas where arrays are not first level

// let schemasForLLM: {} = {};
// for (const key in largeArraysSchema) {
//   const originalSchema = structuredClone(largeArraysSchema[key].items);
//   console.log(
//     "key",
//     key,
//     "\noriginalSchema",
//     JSON.stringify(largeArraysSchema[key], null, 2),
//   );
//   let clonedObj = {
//     type: "object",
//     properties: {
//       informationFilled: {
//         type: "boolean",
//       },
//       data: {
//         type: "object",
//         properties: originalSchema.properties,
//       },
//     },
//   };
//   schemasForLLM[key] = clonedObj;
// }
