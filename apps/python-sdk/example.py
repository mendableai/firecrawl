#!/usr/bin/env python3
"""
Example demonstrating the v2 search functionality with individual parameters.
"""

import os
import time
from dotenv import load_dotenv
from firecrawl import Firecrawl
from firecrawl.v2.types import ScrapeOptions, ScrapeFormats

load_dotenv()

def main():
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("FIRECRAWL_API_KEY is not set")
    
    api_url = os.getenv("FIRECRAWL_API_URL")
    if not api_url:
        raise ValueError("FIRECRAWL_API_URL is not set")

    firecrawl = Firecrawl(api_key=api_key, api_url=api_url)

    # crawl    
    crawl_response = firecrawl.crawl("docs.firecrawl.dev", limit=5)
    print(crawl_response)

    crawl_job = firecrawl.start_crawl('docs.firecrawl.dev', limit=5)
    print(crawl_job)

    while (crawl_job.status != 'completed'):
        crawl_job = firecrawl.get_crawl_status(crawl_job.id)
        time.sleep(2)

    print(crawl_job)

    # crawl params preview
    params_data = firecrawl.crawl_params_preview(
      url="https://docs.firecrawl.dev",
      prompt="Extract all blog posts and documentation"
    )
    print(params_data)

    # search examples
    search_response = firecrawl.search(
      query="What is the capital of France?",
      sources=["web", "news", "images"],
      limit=10
    )
    
    print(search_response)

if __name__ == "__main__":
    main() 