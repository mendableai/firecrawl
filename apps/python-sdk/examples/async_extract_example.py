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
        result = app.async_extract(
            urls=['https://example1.com', 'https://example2.com', 'https://blog.example.com'],
            prompt='example_prompt',
            system_prompt='example_system_prompt',
            allow_external_links=True,
            enable_web_search=True,
            show_sources=True
        )
        
        print("Success!")
        print(f"Result: {result}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
