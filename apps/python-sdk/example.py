#!/usr/bin/env python3
"""
Example demonstrating the v2 search functionality with individual parameters.
"""

import os
import time
from dotenv import load_dotenv
from firecrawl import Firecrawl
from firecrawl.v2.types import ScrapeOptions, ScrapeFormats, WebhookConfig

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

    # start crawl
    crawl_job = firecrawl.start_crawl('docs.firecrawl.dev', limit=5)
    print(crawl_job)

    crawl_response = firecrawl.get_crawl_status(crawl_job.id)
    print(crawl_response)

    while (crawl_response.status != 'completed'):
        print(f"Crawl status: {crawl_response.status}")
        crawl_response = firecrawl.get_crawl_status(crawl_job.id)
        time.sleep(2)

    print(crawl_response)

    # crawl params preview
    params_data = firecrawl.crawl_params_preview(
      url="https://docs.firecrawl.dev",
      prompt="Extract all blog posts and documentation"
    )
    print(params_data)

    # crawl with webhook example
    webhook_job = firecrawl.start_crawl(
        "docs.firecrawl.dev",
        limit=3,
        webhook="https://your-webhook-endpoint.com/firecrawl"
    )
    
    # advanced webhook with configuration
    webhook_config = WebhookConfig(
        url="https://your-webhook-endpoint.com/firecrawl",
        headers={"Authorization": "Bearer your-token"},
        events=["completed", "failed"]
    )
    
    webhook_job_advanced = firecrawl.start_crawl(
        "docs.firecrawl.dev",
        limit=2,
        webhook=webhook_config
    )

    # Check crawl errors
    errors = firecrawl.get_crawl_errors(crawl_job.id)
    print(f"Crawl errors: {errors.errors}")
    print(f"Robots blocked: {errors.robots_blocked}")

    # search examples
    search_response = firecrawl.search(
      query="What is the capital of France?",
      sources=["web", "news", "images"],
      limit=10
    )
    
    print(search_response)

if __name__ == "__main__":
    main() 