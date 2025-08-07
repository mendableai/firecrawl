import pytest
import time
import os
from dotenv import load_dotenv
from firecrawl import Firecrawl
from firecrawl.v2.types import ScrapeOptions

load_dotenv()

if not os.getenv("API_KEY"):
    raise ValueError("API_KEY is not set")

if not os.getenv("API_URL"):
    raise ValueError("API_URL is not set")

class TestCrawlE2E:
    """End-to-end tests for crawl functionality."""

    def setup_method(self):
        """Set up test client."""
        self.client = Firecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))

    def test_start_crawl_minimal_request(self):
        """Test starting a crawl with minimal parameters."""
        crawl_job = self.client.start_crawl("https://docs.firecrawl.dev", limit=3)

        assert crawl_job.id is not None
        assert crawl_job.url is not None

    def test_start_crawl_with_options(self):
        """Test starting a crawl with options."""
        crawl_job = self.client.start_crawl(
            "https://docs.firecrawl.dev", 
            limit=5,
            max_discovery_depth=2
        )
        
        assert crawl_job.id is not None
        assert crawl_job.url is not None

    def test_start_crawl_with_prompt(self):
        """Test starting a crawl with prompt."""
        crawl_job = self.client.start_crawl(
            "https://firecrawl.dev", 
            prompt="Extract all blog posts",
            limit=3
        )
        
        assert crawl_job.id is not None
        assert crawl_job.url is not None

    def test_get_crawl_status(self):
        """Test getting crawl status."""
        # First start a crawl
        start_job = self.client.start_crawl("https://docs.firecrawl.dev", limit=3)
        assert start_job.id is not None
        
        job_id = start_job.id
        
        # Get status
        status_job = self.client.get_crawl_status(job_id)
        
        assert status_job.status in ["scraping", "completed", "failed"]
        assert status_job.completed >= 0
        assert status_job.expires_at is not None
        assert status_job.next is not None
        assert isinstance(status_job.data, list)

    def test_cancel_crawl(self):
        """Test canceling a crawl."""
        start_job = self.client.start_crawl("https://docs.firecrawl.dev", limit=3)
        assert start_job.id is not None
        
        job_id = start_job.id
        cancel_job = self.client.cancel_crawl(job_id)
        
        time.sleep(5)
        assert cancel_job == True

    def test_crawl_with_wait(self):
        """Test crawl with wait for completion."""
        crawl_job = self.client.crawl(
            "docs.firecrawl.dev",
            limit=3,
            max_discovery_depth=2,
            poll_interval=1,
            timeout=120
        )
        
        assert crawl_job.status in ["completed", "failed"]
        assert crawl_job.completed >= 0
        assert crawl_job.total >= 0
        assert isinstance(crawl_job.data, list)

    def test_crawl_with_prompt_and_wait(self):
        """Test crawl with prompt and wait for completion."""
        crawl_job = self.client.crawl(
            "https://docs.firecrawl.dev",
            prompt="Extract all blog posts",
            limit=3,
            poll_interval=1,
            timeout=120
        )
        
        assert crawl_job.status in ["completed", "failed"]
        assert crawl_job.completed >= 0
        assert crawl_job.total >= 0
        assert isinstance(crawl_job.data, list)

    def test_crawl_with_scrape_options(self):
        """Test crawl with scrape options."""
        scrape_opts = ScrapeOptions(
            formats=["markdown"],
            only_main_content=False,
            mobile=True,
        )
        
        crawl_job = self.client.start_crawl(
            "https://docs.firecrawl.dev", 
            limit=2,
            scrape_options=scrape_opts
        )
        
        assert crawl_job.id is not None

    def test_crawl_all_parameters(self):
        """Test crawl with all possible parameters."""
        scrape_opts = ScrapeOptions(
            formats=["markdown", "html"],
            headers={"User-Agent": "Test Bot"},
            include_tags=["h1", "h2"],
            exclude_tags=["nav"],
            only_main_content=False,
            timeout=15000,
            wait_for=2000,
            mobile=True,
            skip_tls_verification=True,
            remove_base64_images=False
        )
        
        crawl_job = self.client.start_crawl(
            "https://docs.firecrawl.dev", 
            prompt="Extract all blog posts and documentation",
            include_paths=["/blog/*", "/docs/*"],
            exclude_paths=["/admin/*"],
            max_discovery_depth=3,
            ignore_sitemap=False,
            limit=5,
            crawl_entire_domain=True,
            allow_external_links=False,
            scrape_options=scrape_opts
        )
        
        assert crawl_job.id is not None


    def test_crawl_params_preview(self):
        """Test crawl_params function."""
        params_data = self.client.crawl_params_preview(
            "https://docs.firecrawl.dev",
            "Extract all blog posts and documentation"
        )

        assert params_data is not None
        assert params_data.limit is not None or params_data.include_paths is not None or params_data.max_discovery_depth is not None 
        assert 'blog/.*' in params_data.include_paths
        assert 'documentation/.*' in params_data.include_paths