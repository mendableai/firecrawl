import os
import pytest
from dotenv import load_dotenv
from firecrawl import Firecrawl
from firecrawl.v2.types import Viewport, ScreenshotAction, Document

load_dotenv()

if not os.getenv("API_KEY"):
    raise ValueError("API_KEY is not set")

if not os.getenv("API_URL"):
    raise ValueError("API_URL is not set")


class TestScrapeE2E:
    """End-to-end tests for scrape functionality (v2)."""

    def setup_method(self):
        self.client = Firecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))

    def _assert_valid_document(self, doc: Document):
        assert isinstance(doc, Document)
        # At least one main content field should be present
        assert (
            (doc.markdown is not None and len(doc.markdown) > 0)
            or (doc.html is not None and len(doc.html) > 0)
            or (doc.raw_html is not None and len(doc.raw_html) > 0)
        )
        # Metadata should exist with a source URL or title when available
        assert doc.metadata is not None

    def test_scrape_minimal(self):
        """Scrape a URL with minimal parameters and return a document."""
        doc = self.client.scrape("https://docs.firecrawl.dev")
        self._assert_valid_document(doc)

    def test_scrape_with_options_markdown(self):
        """Scrape with simple markdown format and options passed as kwargs."""
        doc = self.client.scrape(
            "https://docs.firecrawl.dev",
            formats=["markdown"],
            only_main_content=False,
            mobile=False,
        )
        self._assert_valid_document(doc)

    def test_scrape_with_screenshot_action_viewport(self):
        """Scrape with a screenshot action including viewport passed as kwargs."""
        viewport = Viewport(width=800, height=600)
        action = ScreenshotAction(full_page=False, quality=80, viewport=viewport)
        doc = self.client.scrape(
            "https://docs.firecrawl.dev",
            formats=["markdown"],
            actions=[action],
        )
        self._assert_valid_document(doc)

    def test_scrape_invalid_url(self):
        """Scrape should fail with empty or invalid URLs."""
        with pytest.raises(ValueError, match="URL cannot be empty"):
            self.client.scrape("")
        
        with pytest.raises(ValueError, match="URL cannot be empty"):
            self.client.scrape("   ")