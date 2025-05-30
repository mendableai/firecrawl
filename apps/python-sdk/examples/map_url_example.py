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
        result = app.map_url(
            url='https://example.com',
            search='example_search',
            ignore_sitemap=True,
            include_subdomains=True,
            sitemap_only=True,
            limit=10,
            timeout=30000
        )
        
        print("Success!")
        print(f"Result: {result}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
