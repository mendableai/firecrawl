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
        result = app.search(
            query='example_query',
            limit=10,
            tbs='example_tbs',
            filter='example_filter',
            lang='example_lang',
            country='example_country',
            location='US',
            timeout=30000
        )
        
        print("Success!")
        print(f"Result: {result}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
