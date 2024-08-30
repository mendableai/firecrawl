import uuid
from firecrawl.firecrawl import FirecrawlApp

app = FirecrawlApp(api_key="fc-")

# Scrape a website:
scrape_result = app.scrape_url('firecrawl.dev')
print(scrape_result['markdown'])

# Crawl a website:
crawl_result = app.crawl_url('docs.firecrawl.dev', {}, True, 2)
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
    'formats': ['extract'],
    'extract': {
        'schema': TopArticlesSchema.model_json_schema()
    }
})

print(llm_extraction_result['extract'])

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

app2 = FirecrawlApp(api_key="fc-", version="v0")


llm_extraction_result = app2.scrape_url('https://news.ycombinator.com', {
    'extractorOptions': {
        'extractionSchema': json_schema,
        'mode': 'llm-extraction'
    },
    'pageOptions':{
        'onlyMainContent': True
    }
})

print(llm_extraction_result['llm_extraction'])