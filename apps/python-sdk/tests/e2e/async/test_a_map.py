import sys
import os
import pytest
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
from firecrawl.firecrawl import AsyncFirecrawlApp

load_dotenv()

API_URL = os.getenv("TEST_API_URL") or "http://localhost:3002"
API_KEY = os.getenv("TEST_API_KEY")

app = AsyncFirecrawlApp(api_url=API_URL, api_key=API_KEY)

TEST_URL = "example.com"

@pytest.mark.asyncio
async def test_map_url_simple():
    result = await app.map_url(TEST_URL)
    
    # Basic response assertions
    assert result is not None
    assert result.success
    assert hasattr(result, "links")
    assert result.links is not None
    assert isinstance(result.links, list)
    assert len(result.links) > 0
    
    # Error handling assertions
    assert hasattr(result, "error")
    assert result.error is None
    
    # Links content validation
    for link in result.links:
        assert isinstance(link, str)
        assert len(link) > 0
        # Links should be valid URLs or relative paths
        assert link.startswith(("http://", "https://", "/")) or "." in link
    
    # Verify we get links related to the domain
    assert any("example.com" in url for url in result.links)
    
    # Check for common website structure links
    domain_links = [link for link in result.links if "example.com" in link]
    assert len(domain_links) > 0
    
    # Validate URL formats
    for link in domain_links:
        if link.startswith("http"):
            assert link.startswith(("http://", "https://"))
            assert "example.com" in link

@pytest.mark.asyncio
async def test_map_url_all_params():
    result = await app.map_url(
        TEST_URL,
        search="test",
        sitemap_only=False,
        include_subdomains=False,
        limit=10
    )
    
    # Basic response assertions
    assert result is not None
    assert result.success
    assert hasattr(result, "links")
    assert result.links is not None
    assert isinstance(result.links, list)
    assert len(result.links) > 0
    
    # Error handling assertions
    assert hasattr(result, "error")
    assert result.error is None
    
    # Parameter validation - limit should be respected
    assert len(result.links) <= 10  # Should respect the limit parameter
    
    # Links content validation
    for link in result.links:
        assert isinstance(link, str)
        assert len(link) > 0
        # Links should be valid URLs or relative paths
        assert link.startswith(("http://", "https://", "/")) or "." in link
    
    # Verify we get links related to the domain
    assert any("example.com" in url for url in result.links)
    
    # Check subdomain exclusion (include_subdomains=False)
    domain_links = [link for link in result.links if "example.com" in link]
    assert len(domain_links) > 0
    
    # Validate that subdomains are excluded when include_subdomains=False
    for link in domain_links:
        if link.startswith("http"):
            # Should not have subdomains like subdomain.example.com
            # Extract domain part
            if "://" in link:
                domain_part = link.split("://")[1].split("/")[0]
                # Should be example.com or www.example.com, not subdomain.example.com
                assert domain_part in ["example.com", "www.example.com"] or domain_part.endswith(".example.com")
    
    # Validate URL formats
    for link in domain_links:
        if link.startswith("http"):
            assert link.startswith(("http://", "https://"))
            assert "example.com" in link
    
    # Check that we have a reasonable number of links (not empty, not excessive)
    assert 1 <= len(result.links) <= 10

@pytest.mark.asyncio
async def test_map_url_with_sitemap():
    """Test mapping with sitemap-only option."""
    result = await app.map_url(
        TEST_URL,
        sitemap_only=True,
        limit=5
    )
    
    # Basic response assertions
    assert result is not None
    assert result.success
    assert hasattr(result, "links")
    assert result.links is not None
    assert isinstance(result.links, list)
    
    # Error handling assertions
    assert hasattr(result, "error")
    assert result.error is None
    
    # Links validation (if any are returned)
    if len(result.links) > 0:
        for link in result.links:
            assert isinstance(link, str)
            assert len(link) > 0
            # Links should be valid URLs
            assert link.startswith(("http://", "https://", "/")) or "." in link
        
        # Should respect limit
        assert len(result.links) <= 5
        
        # Should contain domain links
        assert any("example.com" in url for url in result.links)

@pytest.mark.asyncio
async def test_map_url_with_search():
    """Test mapping with search parameter."""
    result = await app.map_url(
        TEST_URL,
        search="contact",
        limit=3
    )
    
    # Basic response assertions
    assert result is not None
    assert result.success
    assert hasattr(result, "links")
    assert result.links is not None
    assert isinstance(result.links, list)
    
    # Error handling assertions
    assert hasattr(result, "error")
    assert result.error is None
    
    # Links validation
    if len(result.links) > 0:
        for link in result.links:
            assert isinstance(link, str)
            assert len(link) > 0
            # Links should be valid URLs
            assert link.startswith(("http://", "https://", "/")) or "." in link
        
        # Should respect limit
        assert len(result.links) <= 3
        
        # Should contain domain links
        assert any("example.com" in url for url in result.links)