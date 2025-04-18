import time
import nest_asyncio
import uuid
import asyncio
from firecrawl.firecrawl import AsyncFirecrawlApp, ScrapeOptions, JsonConfig
from pydantic import BaseModel, Field
from typing import List

app = AsyncFirecrawlApp(api_url="https://api.firecrawl.dev")

async def example_scrape():
    # Scrape a website:
    scrape_result = await app.scrape_url('example.com', formats=["markdown", "html"])
    print(scrape_result.markdown)

async def example_batch_scrape():
    # Batch scrape
    urls = ['https://example.com', 'https://docs.firecrawl.dev']

    # Synchronous batch scrape
    batch_result = await app.batch_scrape_urls(urls, formats=["markdown", "html"])
    print("Synchronous Batch Scrape Result:")
    print(batch_result.data[0].markdown)

    # Asynchronous batch scrape
    async_batch_result = await app.async_batch_scrape_urls(urls, formats=["markdown", "html"])
    print("\nAsynchronous Batch Scrape Result:")
    print(async_batch_result)

async def example_crawl():
    # Crawl a website:
    crawl_result = await app.crawl_url('firecrawl.dev', exclude_paths=['blog/*'])
    print(crawl_result.data[0].markdown)

    # Asynchronous Crawl a website:
    async_result = await app.async_crawl_url('firecrawl.dev', exclude_paths=['blog/*'])
    print(async_result)

    crawl_status = await app.check_crawl_status(async_result.id)
    print(crawl_status)

    attempts = 15
    while attempts > 0 and crawl_status.status != 'completed':
        print(crawl_status)
        crawl_status = await app.check_crawl_status(async_result.id)
        attempts -= 1
        await asyncio.sleep(1)  # Use async sleep instead of time.sleep

    crawl_status = await app.check_crawl_status(async_result.id)
    print(crawl_status)

async def example_llm_extraction():
    # Define schema to extract contents into using pydantic
    class ArticleSchema(BaseModel):
        title: str
        points: int 
        by: str
        commentsURL: str

    class TopArticlesSchema(BaseModel):
        top: List[ArticleSchema] = Field(..., description="Top 5 stories")

    extract_config = JsonConfig(schema=TopArticlesSchema.model_json_schema())

    llm_extraction_result = await app.scrape_url('https://news.ycombinator.com', formats=["extract"], extract=extract_config)

    print(llm_extraction_result.extract)

async def example_map_and_extract():
    # Map a website:
    map_result = await app.map_url('https://firecrawl.dev', search="blog")
    print(map_result)

    # Extract URLs:
    class ExtractSchema(BaseModel):
        title: str
        description: str
        links: List[str]

    # Define the schema using Pydantic
    extract_schema = ExtractSchema.schema()

    # Perform the extraction
    extract_result = await app.extract(['https://firecrawl.dev'], prompt="Extract the title, description, and links from the website", schema=extract_schema)
    print(extract_result)

async def example_deep_research():
    # Deep research example
    research_result = await app.deep_research(
        "What are the latest developments in large language models?",
        max_urls=4
    )
    print("Research Results:", research_result)

async def example_generate_llms_text():
    # Generate LLMs.txt example
    llms_result = await app.generate_llms_text(
        "https://firecrawl.dev")
    print("LLMs.txt Results:", llms_result)

# Define event handlers for websocket
def on_document(detail):
    print("DOC", detail)

def on_error(detail):
    print("ERR", detail['error'])

def on_done(detail):
    print("DONE", detail['status'])

async def example_websocket_crawl():
    # Initiate the crawl job and get the watcher
    watcher = await app.crawl_url_and_watch('firecrawl.dev', { 'excludePaths': ['blog/*'], 'limit': 5 })

    # Add event listeners
    watcher.add_event_listener("document", on_document)
    watcher.add_event_listener("error", on_error)
    watcher.add_event_listener("done", on_done)

    # Start the watcher
    await watcher.connect()

async def main():
    nest_asyncio.apply()
    
    await example_scrape()
    await example_batch_scrape()
    await example_crawl()
    await example_llm_extraction()
    await example_map_and_extract()
    await example_websocket_crawl()
    await example_deep_research()
    await example_generate_llms_text()

if __name__ == "__main__":
    asyncio.run(main())
