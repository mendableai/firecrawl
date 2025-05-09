import os
import pytest
from dotenv import load_dotenv
from firecrawl import FirecrawlApp

load_dotenv()

API_URL = "https://api.firecrawl.dev"
API_KEY = os.getenv("TEST_API_KEY")

app = FirecrawlApp(api_url=API_URL, api_key=API_KEY)

def test_generate_llms_text_placeholder():
    # TODO: Implement E2E tests for generate_llms_text
    assert True 