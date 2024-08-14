# Firecrawl Node SDK

The Firecrawl Node SDK is a library that allows you to easily scrape and crawl websites, and output the data in a format ready for use with language models (LLMs). It provides a simple and intuitive interface for interacting with the Firecrawl API.

## Installation

To install the Firecrawl Node SDK, you can use npm:

```bash
npm install @mendable/firecrawl-js
```

## Usage

1. Get an API key from [firecrawl.dev](https://firecrawl.dev)
2. Set the API key as an environment variable named `FIRECRAWL_API_KEY` or pass it as a parameter to the `FirecrawlApp` class.

Here's an example of how to use the SDK with error handling:

```js
import FirecrawlApp from "@mendable/firecrawl-js";

// Initialize the FirecrawlApp with your API key
const app = new FirecrawlApp({ apiKey: "YOUR_API_KEY" });

// Scrape a single URL
const url = "https://mendable.ai";
const scrapedData = await app.scrapeUrl(url);

// Crawl a website
const crawlUrl = "https://mendable.ai";
const params = {
  crawlerOptions: {
    excludes: ["blog/"],
    includes: [], // leave empty for all pages
    limit: 1000,
  },
  pageOptions: {
    onlyMainContent: true,
  },
};

const crawlResult = await app.crawlUrl(crawlUrl, params);
```

### Scraping a URL

To scrape a single URL with error handling, use the `scrapeUrl` method. It takes the URL as a parameter and returns the scraped data as a dictionary.

```js
const url = "https://example.com";
const scrapedData = await app.scrapeUrl(url);
```

### Crawling a Website

To crawl a website with error handling, use the `crawlUrl` method. It takes the starting URL and optional parameters as arguments. The `params` argument allows you to specify additional options for the crawl job, such as the maximum number of pages to crawl, allowed domains, and the output format.

```js
const crawlUrl = "https://example.com";

const params = {
  crawlerOptions: {
    excludes: ["blog/"],
    includes: [], // leave empty for all pages
    limit: 1000,
  },
  pageOptions: {
    onlyMainContent: true,
  },
};

const waitUntilDone = true;
const pollInterval = 5;

const crawlResult = await app.crawlUrl(
  crawlUrl,
  params,
  waitUntilDone,
  pollInterval
);
```

### Checking Crawl Status

To check the status of a crawl job with error handling, use the `checkCrawlStatus` method. It takes the job ID as a parameter and returns the current status of the crawl job.

```js
const status = await app.checkCrawlStatus(jobId);
```

### Extracting structured data from a URL

With LLM extraction, you can easily extract structured data from any URL. We support zod schema to make it easier for you too. Here is how you to use it:

```js
import FirecrawlApp from "@mendable/firecrawl-js";
import { z } from "zod";

const app = new FirecrawlApp({
  apiKey: "fc-YOUR_API_KEY",
});

// Define schema to extract contents into
const schema = z.object({
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

const scrapeResult = await app.scrapeUrl("https://firecrawl.dev", {
  extractorOptions: { extractionSchema: schema },
});

console.log(scrapeResult.data["llm_extraction"]);
```

### Search for a query

With the `search` method, you can search for a query in a search engine and get the top results along with the page content for each result. The method takes the query as a parameter and returns the search results.

```js
const query = "what is mendable?";
const searchResults = await app.search(query, {
  pageOptions: {
    fetchPageContent: true, // Fetch the page content for each search result
  },
});
```

## Error Handling

The SDK handles errors returned by the Firecrawl API and raises appropriate exceptions. If an error occurs during a request, an exception will be raised with a descriptive error message. The examples above demonstrate how to handle these errors using `try/catch` blocks.

## License

The Firecrawl Node SDK is licensed under the MIT License. This means you are free to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the SDK, subject to the following conditions:

- The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Please note that while this SDK is MIT licensed, it is part of a larger project which may be under different licensing terms. Always refer to the license information in the root directory of the main project for overall licensing details.
