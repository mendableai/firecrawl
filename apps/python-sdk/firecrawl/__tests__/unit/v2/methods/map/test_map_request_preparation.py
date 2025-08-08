import pytest
from firecrawl.v2.types import MapOptions
from firecrawl.v2.methods.map import _prepare_map_request


class TestMapRequestPreparation:
    """Unit tests for map request preparation."""

    def test_basic_request_preparation(self):
        data = _prepare_map_request("https://example.com")
        assert data["url"] == "https://example.com"
        # Default sitemap handling should be "include" when no flags provided
        assert "sitemap" not in data  # we only send when options provided

    def test_sitemap_transformations(self):
        # sitemap_only -> sitemap: "only"
        opts = MapOptions(sitemap_only=True)
        data = _prepare_map_request("https://example.com", opts)
        assert data["sitemap"] == "only"

        # ignore_sitemap -> sitemap: "skip"
        opts = MapOptions(ignore_sitemap=True)
        data = _prepare_map_request("https://example.com", opts)
        assert data["sitemap"] == "skip"

        # default when options present but neither flag set -> include
        opts = MapOptions(search="docs")
        data = _prepare_map_request("https://example.com", opts)
        assert data["sitemap"] == "include"

    def test_field_conversions(self):
        opts = MapOptions(
            search="docs",
            include_subdomains=True,
            limit=25,
            sitemap_only=True,
        )
        data = _prepare_map_request("https://example.com", opts)

        assert data["url"] == "https://example.com"
        assert data["search"] == "docs"
        assert data["includeSubdomains"] is True
        assert data["limit"] == 25
        assert data["sitemap"] == "only"

    def test_invalid_url(self):
        with pytest.raises(ValueError):
            _prepare_map_request("")
        with pytest.raises(ValueError):
            _prepare_map_request("   ")

