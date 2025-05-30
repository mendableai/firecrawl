import os
from firecrawl import FirecrawlApp
from firecrawl import (
    WaitAction, ScreenshotAction, ClickAction, WriteAction, 
    PressAction, ScrollAction, ScrapeAction, ExecuteJavascriptAction,
    LocationConfig, JsonConfig
)

def main():
    # Initialize the FirecrawlApp
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("Please set FIRECRAWL_API_KEY environment variable")
    
    app = FirecrawlApp(api_key=api_key)
    
    # Example with all parameters
    try:
        result = app.async_batch_scrape_urls(
            urls=['https://example1.com', 'https://example2.com', 'https://blog.example.com'],
            formats=['markdown', 'html', 'raw_html', 'links', 'screenshot', 'screenshot@full_page', 'extract', 'json', 'change_tracking'],
            include_tags=['div', 'p', 'span'],
            exclude_tags=['div', 'p', 'span'],
            only_main_content=True,
            wait_for=30000,
            timeout=30000,
            location=LocationConfig(country="US", languages=["en"]),
            mobile=True,
            skip_tls_verification=True,
            remove_base64_images=True,
            block_ads=True,
            proxy='basic',
            extract=JsonConfig(schema={"type": "object", "properties": {"title": {"type": "string"}, "description": {"type": "string"}}}),
            json_options=JsonConfig(schema={"type": "object", "properties": {"title": {"type": "string"}, "description": {"type": "string"}}}),
            actions=[
                WaitAction(milliseconds=1000, selector="#content"),
                ScreenshotAction(full_page=True),
                ClickAction(selector="button.submit"),
                WriteAction(text="example@email.com"),
                PressAction(key="Enter"),
                ScrollAction(direction="down", selector=".scrollable-container"),
                ScrapeAction(),
                ExecuteJavascriptAction(script="function get_title() { return document.title; }; get_title();")
            ],
            idempotency_key='example_idempotency_key'
        )
        
        print("Success!")
        print(f"Result: {result}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
