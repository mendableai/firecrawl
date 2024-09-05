<h3 align="center">
  <img
    src="https://raw.githubusercontent.com/mendableai/firecrawl/main/img/firecrawl_logo.png"
    height="200"
  >
</h3>
<div align="center">
    <a href="https://github.com/mendableai/firecrawl/blob/main/LICENSE">
  <img src="https://img.shields.io/github/license/mendableai/firecrawl" alt="License">
</a>
    <a href="https://pepy.tech/project/firecrawl-py">
  <img src="https://static.pepy.tech/badge/firecrawl-py" alt="Downloads">
</a>
<a href="https://GitHub.com/mendableai/firecrawl/graphs/contributors">
  <img src="https://img.shields.io/github/contributors/mendableai/firecrawl.svg" alt="GitHub Contributors">
</a>
<a href="https://firecrawl.dev">
  <img src="https://img.shields.io/badge/Visit-firecrawl.dev-orange" alt="Visit firecrawl.dev">
</a>
</div>
<div>
  <p align="center">
    <a href="https://twitter.com/firecrawl_dev">
      <img src="https://img.shields.io/badge/Follow%20on%20X-000000?style=for-the-badge&logo=x&logoColor=white" alt="Follow on X" />
    </a>
    <a href="https://www.linkedin.com/company/104100957">
      <img src="https://img.shields.io/badge/Follow%20on%20LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="Follow on LinkedIn" />
    </a>
    <a href="https://discord.com/invite/gSmWdAkdwd">
      <img src="https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join our Discord" />
    </a>
  </p>
</div>

# 🔥 Firecrawl

Crawl and convert any website into LLM-ready markdown or structured data. Built by [Mendable.ai](https://mendable.ai?ref=gfirecrawl) and the Firecrawl community. Includes powerful scraping, crawling and data extraction capabilities.

_This repository is in its early development stages. We are still merging custom modules in the mono repo. It's not completely yet ready for full self-host deployment, but you can already run it locally._

## What is Firecrawl?

[Firecrawl](https://firecrawl.dev?ref=github) is an API service that takes a URL, crawls it, and converts it into clean markdown or structured data. We crawl all accessible subpages and give you clean data for each. No sitemap required. Check out our [documentation](https://docs.firecrawl.dev).

_Pst. hey, you, join our stargazers :)_

<a href="https://github.com/mendableai/firecrawl">
  <img src="https://img.shields.io/github/stars/mendableai/firecrawl.svg?style=social&label=Star&maxAge=2592000" alt="GitHub stars">
</a>

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
curl -X POST https://api.firecrawl.dev/v1/crawl \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer fc-YOUR_API_KEY' \
    -d '{
      "url": "https://docs.firecrawl.dev",
      "limit": 100,
      "scrapeOptions": {
        "formats": ["markdown", "html"]
      }
    }'
```

Returns a crawl job id and the url to check the status of the crawl.

```json
{
  "success": true,
  "id": "123-456-789",
  "url": "https://api.firecrawl.dev/v1/crawl/123-456-789"
}
```

### Check Crawl Job

Used to check the status of a crawl job and get its result.

```bash
curl -X GET https://api.firecrawl.dev/v1/crawl/123-456-789 \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

```json
{
  "status": "completed",
  "total": 36,
  "creditsUsed": 36,
  "expiresAt": "2024-00-00T00:00:00.000Z",
  "data": [
    {
      "markdown": "[Firecrawl Docs home page![light logo](https://mintlify.s3-us-west-1.amazonaws.com/firecrawl/logo/light.svg)!...",
      "html": "<!DOCTYPE html><html lang=\"en\" class=\"js-focus-visible lg:[--scroll-mt:9.5rem]\" data-js-focus-visible=\"\">...",
      "metadata": {
        "title": "Build a 'Chat with website' using Groq Llama 3 | Firecrawl",
        "language": "en",
        "sourceURL": "https://docs.firecrawl.dev/learn/rag-llama3",
        "description": "Learn how to use Firecrawl, Groq Llama 3, and Langchain to build a 'Chat with your website' bot.",
        "ogLocaleAlternate": [],
        "statusCode": 200
      }
    }
  ]
}
```

### Scraping

Used to scrape a URL and get its content in the specified formats.

```bash
curl -X POST https://api.firecrawl.dev/v1/scrape \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer YOUR_API_KEY' \
    -d '{
      "url": "https://docs.firecrawl.dev",
      "formats" : ["markdown", "html"]
    }'
```

Response:

```json
{
  "success": true,
  "data": {
    "markdown": "Launch Week I is here! [See our Day 2 Release 🚀](https://www.firecrawl.dev/blog/launch-week-i-day-2-doubled-rate-limits)[💥 Get 2 months free...",
    "html": "<!DOCTYPE html><html lang=\"en\" class=\"light\" style=\"color-scheme: light;\"><body class=\"__variable_36bd41 __variable_d7dc5d font-inter ...",
    "metadata": {
      "title": "Home - Firecrawl",
      "description": "Firecrawl crawls and converts any website into clean markdown.",
      "language": "en",
      "keywords": "Firecrawl,Markdown,Data,Mendable,Langchain",
      "robots": "follow, index",
      "ogTitle": "Firecrawl",
      "ogDescription": "Turn any website into LLM-ready data.",
      "ogUrl": "https://www.firecrawl.dev/",
      "ogImage": "https://www.firecrawl.dev/og.png?123",
      "ogLocaleAlternate": [],
      "ogSiteName": "Firecrawl",
      "sourceURL": "https://firecrawl.dev",
      "statusCode": 200
    }
  }
}
```

### Map (Alpha)

Used to map a URL and get urls of the website. This returns most links present on the website.

```bash cURL
curl -X POST https://api.firecrawl.dev/v1/map \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer YOUR_API_KEY' \
    -d '{
      "url": "https://firecrawl.dev"
    }'
```

Response:

```json
{
  "status": "success",
  "links": [
    "https://firecrawl.dev",
    "https://www.firecrawl.dev/pricing",
    "https://www.firecrawl.dev/blog",
    "https://www.firecrawl.dev/playground",
    "https://www.firecrawl.dev/smart-crawl",
  ]
}
```

#### Map with search

Map with `search` param allows you to search for specific urls inside a website.

```bash cURL
curl -X POST https://api.firecrawl.dev/v1/map \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer YOUR_API_KEY' \
    -d '{
      "url": "https://firecrawl.dev",
      "search": "docs"
    }'
```

Response will be an ordered list from the most relevant to the least relevant.

```json
{
  "status": "success",
  "links": [
    "https://docs.firecrawl.dev",
    "https://docs.firecrawl.dev/sdks/python",
    "https://docs.firecrawl.dev/learn/rag-llama3",
  ]
}
```

### LLM Extraction (Beta)

Used to extract structured data from scraped pages.

```bash
curl -X POST https://api.firecrawl.dev/v1/scrape \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer YOUR_API_KEY' \
    -d '{
      "url": "https://www.mendable.ai/",
      "formats": ["extract"],
      "extract": {
        "schema": {
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

### Extracting without a schema (New)

You can now extract without a schema by just passing a `prompt` to the endpoint. The llm chooses the structure of the data.

```bash
curl -X POST https://api.firecrawl.dev/v1/scrape \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer YOUR_API_KEY' \
    -d '{
      "url": "https://docs.firecrawl.dev/",
      "formats": ["extract"],
      "extract": {
        "prompt": "Extract the company mission from the page."
      }
    }'
```


### Search (v0) (Beta)

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

## Using Python SDK

### Installing Python SDK

```bash
pip install firecrawl-py
```

### Crawl a website

```python
from firecrawl.firecrawl import FirecrawlApp

app = FirecrawlApp(api_key="fc-YOUR_API_KEY")

# Scrape a website:
scrape_status = app.scrape_url(
  'https://firecrawl.dev', 
  params={'formats': ['markdown', 'html']}
)
print(scrape_status)

# Crawl a website:
crawl_status = app.crawl_url(
  'https://firecrawl.dev', 
  params={
    'limit': 100, 
    'scrapeOptions': {'formats': ['markdown', 'html']}
  }, 
  wait_until_done=True, 
  poll_interval=30
)
print(crawl_status)
```

### Extracting structured data from a URL

With LLM extraction, you can easily extract structured data from any URL. We support pydantic schemas to make it easier for you too. Here is how you to use it:

```python

from firecrawl.firecrawl import FirecrawlApp

app = FirecrawlApp(api_key="fc-YOUR_API_KEY")

class ArticleSchema(BaseModel):
    title: str
    points: int
    by: str
    commentsURL: str

class TopArticlesSchema(BaseModel):
    top: List[ArticleSchema] = Field(..., max_items=5, description="Top 5 stories")

data = app.scrape_url('https://news.ycombinator.com', {
    'formats': ['extract'],
    'extract': {
        'schema': TopArticlesSchema.model_json_schema()
    }
})
print(data["extract"])
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

```js
import FirecrawlApp, { CrawlParams, CrawlStatusResponse } from '@mendable/firecrawl-js';

const app = new FirecrawlApp({apiKey: "fc-YOUR_API_KEY"});

// Scrape a website
const scrapeResponse = await app.scrapeUrl('https://firecrawl.dev', {
  formats: ['markdown', 'html'],
});

if (scrapeResponse) {
  console.log(scrapeResponse)
}

// Crawl a website
const crawlResponse = await app.crawlUrl('https://firecrawl.dev', {
  limit: 100,
  scrapeOptions: {
    formats: ['markdown', 'html'],
  }
} as CrawlParams, true, 30) as CrawlStatusResponse;

if (crawlResponse) {
  console.log(crawlResponse)
}
```


### Extracting structured data from a URL

With LLM extraction, you can easily extract structured data from any URL. We support zod schema to make it easier for you too. Here is how you to use it:

```js
import FirecrawlApp from "@mendable/firecrawl-js";
import { z } from "zod";

const app = new FirecrawlApp({
  apiKey: "fc-YOUR_API_KEY"
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
