import os
from dotenv import load_dotenv
from firecrawl import Firecrawl


load_dotenv()

if not os.getenv("API_KEY"):
    raise ValueError("API_KEY is not set")

if not os.getenv("API_URL"):
    raise ValueError("API_URL is not set")


import pytest


class TestMapE2E:
    """End-to-end tests for map functionality (v2)."""

    def setup_method(self):
        self.client = Firecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))

    def test_map_minimal_request(self):
        resp = self.client.map("https://docs.firecrawl.dev")

        assert hasattr(resp, "success") and resp.success is True
        assert hasattr(resp, "data") and resp.data is not None
        assert hasattr(resp.data, "links")
        assert isinstance(resp.data.links, list)

        # Basic sanity checks on at least one link
        if len(resp.data.links) > 0:
            first = resp.data.links[0]
            assert hasattr(first, "url")
            assert isinstance(first.url, str) and first.url.startswith("http")

    @pytest.mark.parametrize(
        "sitemap_only,ignore_sitemap",
        [
            (True, None),   # sitemap: only
            (None, True),   # sitemap: skip
            (None, None),   # sitemap: include (default)
        ],
    )
    def test_map_with_options(self, sitemap_only, ignore_sitemap):
        kwargs = {
            "search": "docs",
            "include_subdomains": True,
            "limit": 10,
        }
        if sitemap_only is not None:
            kwargs["sitemap_only"] = sitemap_only
        if ignore_sitemap is not None:
            kwargs["ignore_sitemap"] = ignore_sitemap

        resp = self.client.map("https://docs.firecrawl.dev", **kwargs)

        assert hasattr(resp, "success") and resp.success is True
        assert hasattr(resp, "data") and resp.data is not None
        assert isinstance(resp.data.links, list)

        # Limit should be respected (server-side)
        assert len(resp.data.links) <= 10

        for link in resp.data.links:
            assert hasattr(link, "url")
            assert isinstance(link.url, str) and link.url.startswith("http")
