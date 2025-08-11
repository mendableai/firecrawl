import os
from dotenv import load_dotenv
from firecrawl import Firecrawl

load_dotenv()

if not os.getenv("API_KEY"):
    raise ValueError("API_KEY is not set")

if not os.getenv("API_URL"):
    raise ValueError("API_URL is not set")


class TestUsageE2E:
    def setup_method(self):
        self.client = Firecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))

    def test_get_concurrency(self):
        resp = self.client.get_concurrency()
        # Shape assertions (endpoint not live yet, but types are defined)
        assert hasattr(resp, "concurrency")
        assert hasattr(resp, "max_concurrency")

    def test_get_credit_usage(self):
        resp = self.client.get_credit_usage()
        assert hasattr(resp, "remaining_credits")

    def test_get_token_usage(self):
        resp = self.client.get_token_usage()
        assert hasattr(resp, "prompt_tokens")
        assert hasattr(resp, "completion_tokens")
        assert hasattr(resp, "total_tokens")

