#!/usr/bin/env python3
"""
Example demonstrating the v2 search functionality with individual parameters.
"""

import os
from dotenv import load_dotenv
from firecrawl import Firecrawl
from firecrawl.v2.types import ScrapeOptions, ScrapeFormats


load_dotenv()

def main():
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("FIRECRAWL_API_KEY is not set")

    firecrawl = Firecrawl(api_key=api_key)

    # search examples
    search_response = firecrawl.search(
      query="What is the capital of France?",
      sources=[
          { type: "web" },
          { type: "news" },
          { type: "images" }
      ],
      limit=10)
    print(search_response)



if __name__ == "__main__":
    main() 