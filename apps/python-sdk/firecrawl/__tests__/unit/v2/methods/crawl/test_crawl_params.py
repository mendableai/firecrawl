import pytest
from unittest.mock import Mock, patch
from firecrawl.v2.types import CrawlParamsRequest, CrawlParamsResponse, CrawlParamsData
from firecrawl.v2.methods.crawl import crawl_params_preview


class TestCrawlParams:
    """Unit tests for crawl_params function."""

    def test_crawl_params_success(self):
        """Test successful crawl_params call."""
        # Mock client and response
        mock_client = Mock()
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {
            "success": True,
            "data": {
                "limit": 10,
                "maxDiscoveryDepth": 3,
                "ignoreSitemap": False
            },
            "warning": None
        }
        mock_client.post.return_value = mock_response
        
        # Create request
        request = CrawlParamsRequest(
            url="https://example.com",
            prompt="Extract all blog posts"
        )
        
        # Call function
        result = crawl_params_preview(mock_client, request)
        
        # Verify client call
        mock_client.post.assert_called_once_with("/v2/crawl-params", {
            "url": "https://example.com",
            "prompt": "Extract all blog posts"
        })
        
        # Verify result
        assert isinstance(result, CrawlParamsData)
        assert result.limit == 10
        assert result.max_discovery_depth == 3
        assert result.ignore_sitemap is False
        assert result.warning is None

    def test_crawl_params_api_error(self):
        """Test crawl_params with API error."""
        # Mock client and response
        mock_client = Mock()
        mock_response = Mock()
        mock_response.ok = False
        mock_response.status_code = 400
        mock_response.text = "Bad Request"
        mock_client.post.return_value = mock_response
        
        # Create request
        request = CrawlParamsRequest(
            url="https://example.com",
            prompt="Extract all blog posts"
        )
        
        # Call function and expect exception
        with pytest.raises(Exception, match="crawl params"):
            crawl_params_preview(mock_client, request)

    def test_crawl_params_success_false(self):
        """Test crawl_params with success=False in response."""
        # Mock client and response
        mock_client = Mock()
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {
            "success": False,
            "error": "Invalid URL provided"
        }
        mock_client.post.return_value = mock_response
        
        # Create request
        request = CrawlParamsRequest(
            url="https://example.com",
            prompt="Extract all blog posts"
        )
        
        # Call function and expect exception
        with pytest.raises(Exception, match="Invalid URL provided"):
            crawl_params_preview(mock_client, request)

    def test_crawl_params_empty_url(self):
        """Test crawl_params with empty URL."""
        # Create request with empty URL
        request = CrawlParamsRequest(
            url="",
            prompt="Extract all blog posts"
        )
        
        # Call function and expect exception
        with pytest.raises(ValueError, match="URL cannot be empty"):
            crawl_params_preview(Mock(), request)

    def test_crawl_params_whitespace_url(self):
        """Test crawl_params with whitespace-only URL."""
        # Create request with whitespace URL
        request = CrawlParamsRequest(
            url="   ",
            prompt="Extract all blog posts"
        )
        
        # Call function and expect exception
        with pytest.raises(ValueError, match="URL cannot be empty"):
            crawl_params_preview(Mock(), request)

    def test_crawl_params_empty_prompt(self):
        """Test crawl_params with empty prompt."""
        # Create request with empty prompt
        request = CrawlParamsRequest(
            url="https://example.com",
            prompt=""
        )
        
        # Call function and expect exception
        with pytest.raises(ValueError, match="Prompt cannot be empty"):
            crawl_params_preview(Mock(), request)

    def test_crawl_params_whitespace_prompt(self):
        """Test crawl_params with whitespace-only prompt."""
        # Create request with whitespace prompt
        request = CrawlParamsRequest(
            url="https://example.com",
            prompt="   "
        )
        
        # Call function and expect exception
        with pytest.raises(ValueError, match="Prompt cannot be empty"):
            crawl_params_preview(Mock(), request)

    def test_crawl_params_complex_options(self):
        """Test crawl_params with complex options in response."""
        # Mock client and response
        mock_client = Mock()
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {
            "success": True,
            "data": {
                "includePaths": ["/blog/*", "/docs/*"],
                "excludePaths": ["/admin/*"],
                "maxDiscoveryDepth": 3,
                "ignoreSitemap": False,
                "limit": 50,
                "crawlEntireDomain": True,
                "allowExternalLinks": False,
                "scrapeOptions": {
                    "formats": ["markdown"],
                    "onlyMainContent": False,
                    "mobile": True,
                    "timeout": None,
                    "waitFor": None,
                    "skipTlsVerification": False,
                    "removeBase64Images": True
                }
            }
        }
        mock_client.post.return_value = mock_response
        
        # Create request
        request = CrawlParamsRequest(
            url="https://example.com",
            prompt="Extract all blog posts and documentation with mobile view"
        )
        
        # Call function
        result = crawl_params_preview(mock_client, request)
        
        # Verify result
        assert result is not None
        
        # Check all fields
        assert result.include_paths == ["/blog/*", "/docs/*"]
        assert result.exclude_paths == ["/admin/*"]
        assert result.max_discovery_depth == 3
        assert result.ignore_sitemap is False
        assert result.limit == 50
        assert result.crawl_entire_domain is True
        assert result.allow_external_links is False
        
        # Check nested scrape options
        assert result.scrape_options is not None
        assert result.scrape_options.formats is not None
        # formats is a ScrapeFormats object, so we need to access its formats field
        assert len(result.scrape_options.formats.formats) == 1
        assert result.scrape_options.formats.formats[0].type == "markdown"
        assert result.scrape_options.only_main_content is False
        assert result.scrape_options.mobile is True 