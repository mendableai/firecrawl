import uuid
from firecrawl.firecrawl import FirecrawlApp

app = FirecrawlApp(api_key="fc-YOUR_API_KEY")

# Scrape a website:
scrape_result = app.scrape_url('firecrawl.dev')
print(scrape_result['markdown'])

# Crawl a website:
idempotency_key = str(uuid.uuid4()) # optional idempotency key
crawl_result = app.crawl_url('mendable.ai', {'crawlerOptions': {'excludes': ['blog/*']}}, True, 2, idempotency_key)
print(crawl_result)

# LLM Extraction:
# Define schema to extract contents into using pydantic
from pydantic import BaseModel, Field
from typing import List

class ArticleSchema(BaseModel):
    title: str
    points: int 
    by: str
    commentsURL: str

class TopArticlesSchema(BaseModel):
    top: List[ArticleSchema] = Field(..., max_items=5, description="Top 5 stories")

llm_extraction_result = app.scrape_url('https://news.ycombinator.com', {
    'extractorOptions': {
        'extractionSchema': TopArticlesSchema.model_json_schema(),
        'mode': 'llm-extraction'
    },
    'pageOptions':{
        'onlyMainContent': True
    }
})

print(llm_extraction_result['llm_extraction'])

# Define schema to extract contents into using json schema
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

llm_extraction_result = app.scrape_url('https://news.ycombinator.com', {
    'extractorOptions': {
        'extractionSchema': json_schema,
        'mode': 'llm-extraction'
    },
    'pageOptions':{
        'onlyMainContent': True
    }
})

print(llm_extraction_result['llm_extraction'])