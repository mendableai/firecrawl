# 🔥 Firecrawl

Crawl and convert any website into LLM-ready markdown. Build by [Mendable.ai](https://mendable.ai?ref=gfirecrawl)


*This repository is currently in its early stages of development. We are in the process of merging custom modules into this mono repository. The primary objective is to enhance the accuracy of LLM responses by utilizing clean data. It is not ready for full self-host yet - we're working on it*

## What is Firecrawl?

[Firecrawl](https://firecrawl.dev?ref=github) is an API service that takes a URL, crawls it, and converts it into clean markdown. We crawl all accessible subpages and give you clean markdown for each. No sitemap required.

## How to use it?

We provide an easy to use API with our hosted version. You can find the playground and documentation [here](https://firecrawl.com/playground). You can also self host the backend if you'd like. 

- [x] [API](https://firecrawl.com/playground)
- [x] [Python SDK](https://github.com/mendableai/firecrawl/tree/main/apps/python-sdk)
- [x] [Langchain Integration 🦜🔗](https://python.langchain.com/docs/integrations/document_loaders/firecrawl/)
- [x] [Llama Index Integration 🦙](https://docs.llamaindex.ai/en/stable/)
- [X] [JS SDK](https://github.com/mendableai/firecrawl/tree/main/apps/js-sdk)
- [ ] LangchainJS - Coming Soon


Self-host. To self-host refer to guide [here](https://github.com/mendableai/firecrawl/blob/main/SELF_HOST.md).

### API Key

To use the API, you need to sign up on [Firecrawl](https://firecrawl.com) and get an API key.
 
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
            "sourceURL": "https://www.mendable.ai/",
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

## Contributing

We love contributions! Please read our [contributing guide](CONTRIBUTING.md) before submitting a pull request.
