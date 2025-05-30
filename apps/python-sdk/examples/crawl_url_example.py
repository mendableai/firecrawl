import os
from firecrawl import FirecrawlApp

def main():
    # Initialize the FirecrawlApp
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("Please set FIRECRAWL_API_KEY environment variable")
    
    app = FirecrawlApp(api_key=api_key)
    
    # Example with all parameters
    try:
        result = app.crawl_url(
            url='https://example.com',
            include_paths=['example1', 'example2'],
            exclude_paths=['example1', 'example2'],
            max_depth=10,
            max_discovery_depth=10,
            limit=10,
            allow_backward_links=True,
            allow_external_links=True,
            ignore_sitemap=True,
            deduplicate_similar_urls=True,
            ignore_query_parameters=True,
            regex_on_full_url=True,
            delay=10,
            poll_interval=10,
            idempotency_key='example_idempotency_key'
        )
        
        print("Success!")
        print(f"Result: {result}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
