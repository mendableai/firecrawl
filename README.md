# 🔥 Firecrawl

Crawl and convert any website into LLM-ready markdown or structured data. Built by [Mendable.ai](https://mendable.ai?ref=gfirecrawl) and the Firecrawl community. Includes powerful scraping, crawling and data extraction capabilities.

_This repository is in its early development stages. We are still merging custom modules in the mono repo. It's not completely yet ready for full self-host deployment, but you can already run it locally._

## What is Firecrawl?

[Firecrawl](https://firecrawl.dev?ref=github) is an API service that takes a URL, crawls it, and converts it into clean markdown or structured data. We crawl all accessible subpages and give you clean data for each. No sitemap required.

_Pst. hey, you, join our stargazers :)_

<img src="https://github.com/mendableai/firecrawl/assets/44934913/53c4483a-0f0e-40c6-bd84-153a07f94d29" width="200">

## How to use it?

We provide an easy to use API with our hosted version. You can find the playground and documentation [here](https://firecrawl.dev/playground). You can also self host the backend if you'd like.

- [x] [API](https://firecrawl.dev/playground)
- [x] [Python SDK](https://github.com/mendableai/firecrawl/tree/main/apps/python-sdk)
- [x] [Node SDK](https://github.com/mendableai/firecrawl/tree/main/apps/js-sdk)
- [x] [Langchain Integration 🦜🔗](https://python.langchain.com/docs/integrations/document_loaders/firecrawl/)
- [x] [Langchain JS Integration 🦜🔗](https://js.langchain.com/docs/integrations/document_loaders/web_loaders/firecrawl)
- [x] [Llama Index Integration 🦙](https://docs.llamaindex.ai/en/latest/examples/data_connectors/WebPageDemo/#using-firecrawl-reader)
- [x] [Dify Integration](https://dify.ai/blog/dify-ai-blog-integrated-with-firecrawl)
- [x] [Langflow Integration](https://docs.langflow.org/)
- [x] [Crew.ai Integration](https://docs.crewai.com/)
- [x] [Flowise AI Integration](https://docs.flowiseai.com/integrations/langchain/document-loaders/firecrawl)
- [x] [PraisonAI Integration](https://docs.praison.ai/firecrawl/)
- [x] [Zapier Integration](https://zapier.com/apps/firecrawl/integrations)
- [ ] Want an SDK or Integration? Let us know by opening an issue.

To run locally, refer to guide [here](https://github.com/mendableai/firecrawl/blob/main/CONTRIBUTING.md).

### API Key

To use the API, you need to sign up on [Firecrawl](https://firecrawl.dev) and get an API key.

### Crawling

Used to crawl a URL and all accessible subpages. This submits a crawl job and returns a job ID to check the status of the crawl.

```bash
curl -X POST https://api.firecrawl.dev/v0/crawl \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer YOUR_API_KEY' \
    -d '{
      "url": "https://mendable.ai"
    }'
```

Returns a jobId

```json
{ "jobId": "1234-5678-9101" }
```

### Check Crawl Job

Used to check the status of a crawl job and get its result.

```bash
curl -X GET https://api.firecrawl.dev/v0/crawl/status/1234-5678-9101 \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

```json
{
  "status": "completed",
  "current": 22,
  "total": 22,
  "data": [
    {
      "content": "Raw Content ",
      "markdown": "# Markdown Content",
      "provider": "web-scraper",
      "metadata": {
        "title": "Mendable | AI for CX and Sales",
        "description": "AI for CX and Sales",
        "language": null,
        "sourceURL": "https://www.mendable.ai/"
      }
    }
  ]
}
```

### Scraping

Used to scrape a URL and get its content.

```bash
curl -X POST https://api.firecrawl.dev/v0/scrape \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer YOUR_API_KEY' \
    -d '{
      "url": "https://mendable.ai"
    }'
```

Response:

```json
{
  "success": true,
  "data": {
    "content": "Raw Content ",
    "markdown": "# Markdown Content",
    "provider": "web-scraper",
    "metadata": {
      "title": "Mendable | AI for CX and Sales",
      "description": "AI for CX and Sales",
      "language": null,
      "sourceURL": "https://www.mendable.ai/"
    }
  }
}
```

### Search (Beta)

Used to search the web, get the most relevant results, scrape each page and return the markdown.

```bash
curl -X POST https://api.firecrawl.dev/v0/search \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer YOUR_API_KEY' \
    -d '{
      "query": "firecrawl",
      "pageOptions": {
        "fetchPageContent": true // false for a fast serp api
      }
    }'
```

```json
{
  "success": true,
  "data": [
    {
      "url": "https://mendable.ai",
      "markdown": "# Markdown Content",
      "provider": "web-scraper",
      "metadata": {
        "title": "Mendable | AI for CX and Sales",
        "description": "AI for CX and Sales",
        "language": null,
        "sourceURL": "https://www.mendable.ai/"
      }
    }
  ]
}
```

### Intelligent Extraction (Beta)

Used to extract structured data from scraped pages.

```bash
curl -X POST https://api.firecrawl.dev/v0/scrape \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer YOUR_API_KEY' \
    -d '{
      "url": "https://www.mendable.ai/",
      "extractorOptions": {
        "mode": "llm-extraction",
        "extractionPrompt": "Based on the information on the page, extract the information from the schema. ",
        "extractionSchema": {
          "type": "object",
          "properties": {
            "company_mission": {
                      "type": "string"
            },
            "supports_sso": {
                      "type": "boolean"
            },
            "is_open_source": {
                      "type": "boolean"
            },
            "is_in_yc": {
                      "type": "boolean"
            }
          },
          "required": [
            "company_mission",
            "supports_sso",
            "is_open_source",
            "is_in_yc"
          ]
        }
      }
    }'
```

```json
{
  "success": true,
  "data": {
    "content": "Raw Content",
    "metadata": {
      "title": "Mendable",
      "description": "Mendable allows you to easily build AI chat applications. Ingest, customize, then deploy with one line of code anywhere you want. Brought to you by SideGuide",
      "robots": "follow, index",
      "ogTitle": "Mendable",
      "ogDescription": "Mendable allows you to easily build AI chat applications. Ingest, customize, then deploy with one line of code anywhere you want. Brought to you by SideGuide",
      "ogUrl": "https://mendable.ai/",
      "ogImage": "https://mendable.ai/mendable_new_og1.png",
      "ogLocaleAlternate": [],
      "ogSiteName": "Mendable",
      "sourceURL": "https://mendable.ai/"
    },
    "llm_extraction": {
      "company_mission": "Train a secure AI on your technical resources that answers customer and employee questions so your team doesn't have to",
      "supports_sso": true,
      "is_open_source": false,
      "is_in_yc": true
    }
  }
}
```

## Using Python SDK

### Installing Python SDK

```bash
pip install firecrawl-py
```

### Crawl a website

```python
from firecrawl import FirecrawlApp

app = FirecrawlApp(api_key="YOUR_API_KEY")

crawl_result = app.crawl_url('mendable.ai', {'crawlerOptions': {'excludes': ['blog/*']}})

# Get the markdown
for result in crawl_result:
    print(result['markdown'])
```

### Scraping a URL

To scrape a single URL, use the `scrape_url` method. It takes the URL as a parameter and returns the scraped data as a dictionary.

```python
url = 'https://example.com'
scraped_data = app.scrape_url(url)
```

### Extracting structured data from a URL

With LLM extraction, you can easily extract structured data from any URL. We support pydantic schemas to make it easier for you too. Here is how you to use it:

```python
class ArticleSchema(BaseModel):
    title: str
    points: int
    by: str
    commentsURL: str

class TopArticlesSchema(BaseModel):
    top: List[ArticleSchema] = Field(..., max_items=5, description="Top 5 stories")

data = app.scrape_url('https://news.ycombinator.com', {
    'extractorOptions': {
        'extractionSchema': TopArticlesSchema.model_json_schema(),
        'mode': 'llm-extraction'
    },
    'pageOptions':{
        'onlyMainContent': True
    }
})
print(data["llm_extraction"])
```

### Search for a query

Performs a web search, retrieve the top results, extract data from each page, and returns their markdown.

```python
query = 'What is Mendable?'
search_result = app.search(query)
```

## Using the Node SDK

### Installation

To install the Firecrawl Node SDK, you can use npm:

```bash
npm install @mendable/firecrawl-js
```

### Usage

1. Get an API key from [firecrawl.dev](https://firecrawl.dev)
2. Set the API key as an environment variable named `FIRECRAWL_API_KEY` or pass it as a parameter to the `FirecrawlApp` class.

### Scraping a URL

To scrape a single URL with error handling, use the `scrapeUrl` method. It takes the URL as a parameter and returns the scraped data as a dictionary.

```js
try {
  const url = "https://example.com";
  const scrapedData = await app.scrapeUrl(url);
  console.log(scrapedData);
} catch (error) {
  console.error("Error occurred while scraping:", error.message);
}
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
const timeout = 5;
const crawlResult = await app.crawlUrl(
  crawlUrl,
  params,
  waitUntilDone,
  timeout
);
```

### Checking Crawl Status

To check the status of a crawl job with error handling, use the `checkCrawlStatus` method. It takes the job ID as a parameter and returns the current status of the crawl job.

```js
const status = await app.checkCrawlStatus(jobId);
console.log(status);
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

const scrapeResult = await app.scrapeUrl("https://news.ycombinator.com", {
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

## Contributing

We love contributions! Please read our [contributing guide](CONTRIBUTING.md) before submitting a pull request.

_It is the sole responsibility of the end users to respect websites' policies when scraping, searching and crawling with Firecrawl. Users are advised to adhere to the applicable privacy policies and terms of use of the websites prior to initiating any scraping activities. By default, Firecrawl respects the directives specified in the websites' robots.txt files when crawling. By utilizing Firecrawl, you expressly agree to comply with these conditions._

## License Disclaimer

This project is primarily licensed under the GNU Affero General Public License v3.0 (AGPL-3.0), as specified in the LICENSE file in the root directory of this repository. However, certain components of this project are licensed under the MIT License. Refer to the LICENSE files in these specific directories for details.

Please note:

- The AGPL-3.0 license applies to all parts of the project unless otherwise specified.
- The SDKs and some UI components are licensed under the MIT License. Refer to the LICENSE files in these specific directories for details.
- When using or contributing to this project, ensure you comply with the appropriate license terms for the specific component you are working with.

For more details on the licensing of specific components, please refer to the LICENSE files in the respective directories or contact the project maintainers.
