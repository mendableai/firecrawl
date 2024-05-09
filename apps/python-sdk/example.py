from firecrawl import FirecrawlApp


app = FirecrawlApp(api_key="fc-YOUR_API_KEY")

crawl_result = app.crawl_url('mendable.ai', {'crawlerOptions': {'excludes': ['blog/*']}})

print(crawl_result[0]['markdown'])

job_id = crawl_result['jobId']
print(job_id)

status = app.check_crawl_status(job_id)
print(status)

from pydantic import BaseModel, Field
from typing import List, Optional

class ArticleSchema(BaseModel):
    title: str
    points: int 
    by: str
    commentsURL: str

class TopArticlesSchema(BaseModel):
    top: List[ArticleSchema] = Field(..., max_items=5, description="Top 5 stories")

a = app.scrape_url('https://news.ycombinator.com', {
    'extractorOptions': {
        'extractionSchema': TopArticlesSchema.model_json_schema(),
        'mode': 'llm-extraction'
    },
    'pageOptions':{
        'onlyMainContent': True
    }
})

