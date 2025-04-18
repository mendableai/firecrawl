from firecrawl.firecrawl import ExtractConfig, FirecrawlApp
from pydantic import BaseModel, Field
from typing import List
import time
app = FirecrawlApp(api_url="https://api.firecrawl.dev")

# # Scrape a website:
scrape_result = app.scrape_url('example.com', formats=["markdown", "html"])
print(scrape_result.markdown)


# # Test batch scrapeq
urls = ['https://example.com', 'https://docs.firecrawl.dev']
# Synchronous batch scrape
batch_result = app.batch_scrape_urls(urls, formats=["markdown", "html"])
print("Synchronous Batch Scrape Result:")
print(batch_result.data[0].markdown)

# # Asynchronous batch scrape
async_batch_result = app.async_batch_scrape_urls(urls, formats=["markdown", "html"])
print("\nAsynchronous Batch Scrape Result:")
print(async_batch_result)

# Crawl a website:
crawl_result = app.crawl_url('firecrawl.dev', exclude_paths=['blog/*'])
print(crawl_result.data[0].markdown)

# # Asynchronous Crawl a website:
async_result = app.async_crawl_url('firecrawl.dev', exclude_paths=['blog/*'])
print(async_result)

crawl_status = app.check_crawl_status(async_result.id)
print(crawl_status)

attempts = 15
while attempts > 0 and crawl_status.status != 'completed':
    print(crawl_status)
    crawl_status = app.check_crawl_status(async_result.id)
    attempts -= 1
    time.sleep(1)

crawl_status = app.check_crawl_status(async_result.id)
print(crawl_status)

# LLM Extraction:
# Define schema to extract contents into using pydantic
class ArticleSchema(BaseModel):
    title: str
    points: int 
    by: str
    commentsURL: str

class TopArticlesSchema(BaseModel):
    top: List[ArticleSchema] = Field(..., description="Top 5 stories")

extract_config = ExtractConfig(schema=TopArticlesSchema.model_json_schema())

llm_extraction_result = app.scrape_url('https://news.ycombinator.com', formats=["extract"], extract=extract_config)

print(llm_extraction_result.extract)

# # Define schema to extract contents into using json schema
json_schema = {
  "type": "object",
  "properties": {
    "top": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": {"type": "string"},
          "points": {"type": "number"},
          "by": {"type": "string"},
          "commentsURL": {"type": "string"}
        },
        "required": ["title", "points", "by", "commentsURL"]
      },
      "minItems": 5,
      "maxItems": 5,
      "description": "Top 5 stories on Hacker News"
    }
  },
  "required": ["top"]
}

extract_config = ExtractConfig(extractionSchema=json_schema, mode="llm-extraction", pageOptions={"onlyMainContent": True})
llm_extraction_result = app.scrape_url('https://news.ycombinator.com', formats=["extract"], extract=extract_config)

print(llm_extraction_result.extract)

# print(llm_extraction_result['llm_extraction'])


# Map a website:
map_result = app.map_url('https://firecrawl.dev', search="blog")
print(map_result)

# Extract URLs:
class ExtractSchema(BaseModel):
    title: str
    description: str
    links: List[str]

# Define the schema using Pydantic
extract_schema = ExtractSchema.schema()

# Perform the extraction
extract_result = app.extract(['https://firecrawl.dev'], prompt="Extract the title, description, and links from the website", schema=extract_schema)
print(extract_result)

# Crawl a website with WebSockets:
# inside an async function...
import nest_asyncio
nest_asyncio.apply()

# Define event handlers
def on_document(detail):
    print("DOC", detail)

def on_error(detail):
    print("ERR", detail['error'])

def on_done(detail):
    print("DONE", detail['status'])

    # Function to start the crawl and watch process
async def start_crawl_and_watch():
    # Initiate the crawl job and get the watcher
    watcher = app.crawl_url_and_watch('firecrawl.dev', { 'excludePaths': ['blog/*'], 'limit': 5 })

    # Add event listeners
    watcher.add_event_listener("document", on_document)
    watcher.add_event_listener("error", on_error)
    watcher.add_event_listener("done", on_done)

    # Start the watcher
    await watcher.connect()