import os
import sys
import pytest
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
from firecrawl.firecrawl import AsyncFirecrawlApp

load_dotenv()

API_URL = os.getenv("TEST_API_URL") or "https://api.firecrawl.dev"
API_KEY = os.getenv("TEST_API_KEY")

app = AsyncFirecrawlApp(api_url=API_URL, api_key=API_KEY)

class ExtractSchema(BaseModel):
    title: str
    description: str
    links: List[str]


@pytest.mark.asyncio
async def test_extract_simple_schema_class():
    result = await app.extract(
        ["https://example.com"],
        prompt="Extract the title, description, and links from the website",
        schema=ExtractSchema
    )
    
    # Basic response assertions
    assert result is not None
    assert result.success
    assert hasattr(result, "data")
    assert result.data is not None
    
    # Error handling assertions
    assert hasattr(result, "error")
    assert result.error is None
    
    # Warning handling assertions
    assert hasattr(result, "warning")
    # Warning can be present or None, so we just check it exists
    
    # Handle both dictionary and object responses
    if isinstance(result.data, dict):
        # Data returned as dictionary
        assert "title" in result.data
        assert "description" in result.data
        assert "links" in result.data
        assert isinstance(result.data["title"], str)
        assert isinstance(result.data["description"], str)
        assert isinstance(result.data["links"], list)
        assert len(result.data["title"]) > 0
        assert len(result.data["description"]) > 0
        
        # Links validation
        for link in result.data["links"]:
            assert isinstance(link, str)
            assert len(link) > 0
            # Links should be valid URLs or relative paths
            assert link.startswith(("http://", "https://", "/", "#")) or "." in link
    else:
        # Data returned as Pydantic model object
        assert hasattr(result.data, "title")
        assert hasattr(result.data, "description")
        assert hasattr(result.data, "links")
        assert isinstance(result.data.title, str)
        assert isinstance(result.data.description, str)
        assert isinstance(result.data.links, list)
        assert len(result.data.title) > 0
        assert len(result.data.description) > 0
        
        # Links validation
        for link in result.data.links:
            assert isinstance(link, str)
            assert len(link) > 0
            # Links should be valid URLs or relative paths
            assert link.startswith(("http://", "https://", "/", "#")) or "." in link
    
    # Response metadata validation
    assert hasattr(result, "id")
    assert hasattr(result, "status")
    if result.status is not None:
        assert result.status in ["processing", "completed", "failed"]

    # Sources validation
    assert hasattr(result, "sources")
    if result.sources is not None:
        if isinstance(result.sources, dict):
            # Sources returned as dictionary with keys like 'links[0]'
            for key, source_list in result.sources.items():
                assert isinstance(key, str)
                assert isinstance(source_list, list)
                for source_url in source_list:
                    assert isinstance(source_url, str)
                    assert len(source_url) > 0
                    # Sources should be valid URLs
                    assert source_url.startswith(("http://", "https://"))
        elif isinstance(result.sources, list):
            # Sources returned as simple list (fallback)
            for source in result.sources:
                assert isinstance(source, str)
                assert len(source) > 0

@pytest.mark.asyncio
async def test_extract_simple_schema_dict():
    result = await app.extract(
        ["https://example.com"],
        prompt="Extract the title, description, and links from the website",
        schema=ExtractSchema.schema()
    )
    
    # Basic response assertions
    assert result is not None
    assert result.success
    assert hasattr(result, "data")
    assert result.data is not None
    
    # Error handling assertions
    assert hasattr(result, "error")
    assert result.error is None
    
    # Warning handling assertions
    assert hasattr(result, "warning")
    
    # Handle both dictionary and object responses
    if isinstance(result.data, dict):
        # Data returned as dictionary
        assert "title" in result.data
        assert "description" in result.data
        assert "links" in result.data
        assert isinstance(result.data["title"], str)
        assert isinstance(result.data["description"], str)
        assert isinstance(result.data["links"], list)
        assert len(result.data["title"]) > 0
        assert len(result.data["description"]) > 0
        
        # Links validation
        for link in result.data["links"]:
            assert isinstance(link, str)
            assert len(link) > 0
            # Links should be valid URLs or relative paths
            assert link.startswith(("http://", "https://", "/", "#")) or "." in link
    else:
        # Data returned as Pydantic model object
        assert hasattr(result.data, "title")
        assert hasattr(result.data, "description")
        assert hasattr(result.data, "links")
        assert isinstance(result.data.title, str)
        assert isinstance(result.data.description, str)
        assert isinstance(result.data.links, list)
        assert len(result.data.title) > 0
        assert len(result.data.description) > 0
        
        # Links validation
        for link in result.data.links:
            assert isinstance(link, str)
            assert len(link) > 0
            # Links should be valid URLs or relative paths
            assert link.startswith(("http://", "https://", "/", "#")) or "." in link
    
    # Response metadata validation
    assert hasattr(result, "id")
    assert hasattr(result, "status")
    if result.status is not None:
        assert result.status in ["processing", "completed", "failed"]

    # Sources validation
    assert hasattr(result, "sources")
    if result.sources is not None:
        if isinstance(result.sources, dict):
            # Sources returned as dictionary with keys like 'links[0]'
            for key, source_list in result.sources.items():
                assert isinstance(key, str)
                assert isinstance(source_list, list)
                for source_url in source_list:
                    assert isinstance(source_url, str)
                    assert len(source_url) > 0
                    # Sources should be valid URLs
                    assert source_url.startswith(("http://", "https://"))
        elif isinstance(result.sources, list):
            # Sources returned as simple list (fallback)
            for source in result.sources:
                assert isinstance(source, str)
                assert len(source) > 0

@pytest.mark.asyncio
async def test_extract_simple_schema_json():
    schema = None
    if hasattr(ExtractSchema, "model_json_schema"):
        schema = ExtractSchema.model_json_schema()
    elif hasattr(ExtractSchema, "schema_json"):
        schema = ExtractSchema.schema_json()
    else:
        pytest.skip("No JSON schema export method available on ExtractSchema")
    
    result = await app.extract(
        ["https://example.com"],
        prompt="Extract the title, description, and links from the website",
        schema=schema
    )
    
    # Basic response assertions
    assert result is not None
    assert result.success
    assert hasattr(result, "data")
    assert result.data is not None
    
    # Error handling assertions
    assert hasattr(result, "error")
    assert result.error is None
    
    # Warning handling assertions
    assert hasattr(result, "warning")
    
    # Handle both dictionary and object responses
    if isinstance(result.data, dict):
        # Data returned as dictionary
        assert "title" in result.data
        assert "description" in result.data
        assert "links" in result.data
        assert isinstance(result.data["title"], str)
        assert isinstance(result.data["description"], str)
        assert isinstance(result.data["links"], list)
        assert len(result.data["title"]) > 0
        assert len(result.data["description"]) > 0
        
        # Links validation
        for link in result.data["links"]:
            assert isinstance(link, str)
            assert len(link) > 0
            # Links should be valid URLs or relative paths
            assert link.startswith(("http://", "https://", "/", "#")) or "." in link
    else:
        # Data returned as Pydantic model object
        assert hasattr(result.data, "title")
        assert hasattr(result.data, "description")
        assert hasattr(result.data, "links")
        assert isinstance(result.data.title, str)
        assert isinstance(result.data.description, str)
        assert isinstance(result.data.links, list)
        assert len(result.data.title) > 0
        assert len(result.data.description) > 0
        
        # Links validation
        for link in result.data.links:
            assert isinstance(link, str)
            assert len(link) > 0
            # Links should be valid URLs or relative paths
            assert link.startswith(("http://", "https://", "/", "#")) or "." in link
    
    # Response metadata validation
    assert hasattr(result, "id")
    assert hasattr(result, "status")
    if result.status is not None:
        assert result.status in ["processing", "completed", "failed"]

    # Sources validation
    assert hasattr(result, "sources")
    if result.sources is not None:
        if isinstance(result.sources, dict):
            # Sources returned as dictionary with keys like 'links[0]'
            for key, source_list in result.sources.items():
                assert isinstance(key, str)
                assert isinstance(source_list, list)
                for source_url in source_list:
                    assert isinstance(source_url, str)
                    assert len(source_url) > 0
                    # Sources should be valid URLs
                    assert source_url.startswith(("http://", "https://"))
        elif isinstance(result.sources, list):
            # Sources returned as simple list (fallback)
            for source in result.sources:
                assert isinstance(source, str)
                assert len(source) > 0

@pytest.mark.asyncio
async def test_extract_all_params():
    class AllParamsSchema(BaseModel):
        title: str
        description: str
        links: List[str]
        author: str
    
    schema = AllParamsSchema.schema()
    result = await app.extract(
        ["https://www.iana.org"],
        prompt="Extract the title, description, links, and author from the website",
        schema=schema,
        system_prompt="You are a helpful extraction agent.",
        allow_external_links=False,
        enable_web_search=False,
        show_sources=True,
        # agent={"model": "FIRE-1"}
    )
    
    # Basic response assertions
    assert result is not None
    assert result.success
    assert hasattr(result, "data")
    assert result.data is not None
    
    # Error handling assertions
    assert hasattr(result, "error")
    assert result.error is None
    
    # Warning handling assertions
    assert hasattr(result, "warning")
    
    # Handle both dictionary and object responses
    if isinstance(result.data, dict):
        # Data returned as dictionary
        assert "title" in result.data
        assert "description" in result.data
        assert "links" in result.data
        assert "author" in result.data
        assert isinstance(result.data["title"], str)
        assert isinstance(result.data["description"], str)
        assert isinstance(result.data["links"], list)
        assert isinstance(result.data["author"], str)
        assert len(result.data["title"]) > 0
        assert len(result.data["description"]) > 0
        
        # Links validation
        for link in result.data["links"]:
            assert isinstance(link, str)
            assert len(link) > 0
            # Links should be valid URLs or relative paths
            assert link.startswith(("http://", "https://", "/", "#")) or "." in link
    else:
        # Data returned as Pydantic model object
        assert hasattr(result.data, "title")
        assert hasattr(result.data, "description")
        assert hasattr(result.data, "links")
        assert hasattr(result.data, "author")
        assert isinstance(result.data.title, str)
        assert isinstance(result.data.description, str)
        assert isinstance(result.data.links, list)
        assert isinstance(result.data.author, str)
        assert len(result.data.title) > 0
        assert len(result.data.description) > 0
        
        # Links validation
        for link in result.data.links:
            assert isinstance(link, str)
            assert len(link) > 0
            # Links should be valid URLs or relative paths
            assert link.startswith(("http://", "https://", "/", "#")) or "." in link
    
    # Sources validation (show_sources=True)
    assert hasattr(result, "sources")
    if result.sources is not None:
        if isinstance(result.sources, dict):
            # Sources returned as dictionary with keys like 'links[0]'
            for key, source_list in result.sources.items():
                assert isinstance(key, str)
                assert isinstance(source_list, list)
                for source_url in source_list:
                    assert isinstance(source_url, str)
                    assert len(source_url) > 0
                    # Sources should be valid URLs
                    assert source_url.startswith(("http://", "https://"))
        elif isinstance(result.sources, list):
            # Sources returned as simple list (fallback)
            for source in result.sources:
                assert isinstance(source, str)
                assert len(source) > 0
    
    # Response metadata validation
    assert hasattr(result, "id")
    assert hasattr(result, "status")
    if result.status is not None:
        assert result.status in ["processing", "completed", "failed"]
    
    # Expires at validation
    assert hasattr(result, "expires_at")
    # expires_at can be None or a datetime, so we just check it exists

@pytest.mark.asyncio
async def test_extract_multiple_urls():
    """Test extraction with multiple URLs."""
    class MultiUrlSchema(BaseModel):
        title: str
        description: str
        links: List[str]
    
    urls = ["https://example.com", "https://www.iana.org"]
    result = await app.extract(
        urls,
        prompt="Extract the title, description, and links from the websites",
        schema=MultiUrlSchema
    )
    
    # Basic response assertions
    assert result is not None
    assert result.success
    assert hasattr(result, "data")
    assert result.data is not None
    
    # Error handling assertions
    assert hasattr(result, "error")
    assert result.error is None
    
    # Sources validation
    assert hasattr(result, "sources")
    if result.sources is not None:
        if isinstance(result.sources, dict):
            # Sources returned as dictionary with keys like 'links[0]'
            for key, source_list in result.sources.items():
                assert isinstance(key, str)
                assert isinstance(source_list, list)
                for source_url in source_list:
                    assert isinstance(source_url, str)
                    assert len(source_url) > 0
                    # Sources should be valid URLs
                    assert source_url.startswith(("http://", "https://"))
        elif isinstance(result.sources, list):
            # Sources returned as simple list (fallback)
            for source in result.sources:
                assert isinstance(source, str)
                assert len(source) > 0
    
    # Handle both dictionary and object responses
    if isinstance(result.data, dict):
        # Data returned as dictionary
        assert "title" in result.data
        assert "description" in result.data
        assert "links" in result.data
        assert isinstance(result.data["title"], str)
        assert isinstance(result.data["description"], str)
        assert isinstance(result.data["links"], list)
        assert len(result.data["title"]) > 0
        assert len(result.data["description"]) > 0
        
        # Links validation
        for link in result.data["links"]:
            assert isinstance(link, str)
            assert len(link) > 0
            # Links should be valid URLs or relative paths
            assert link.startswith(("http://", "https://", "/", "#")) or "." in link
    else:
        # Data returned as Pydantic model object
        assert hasattr(result.data, "title")
        assert hasattr(result.data, "description")
        assert hasattr(result.data, "links")
        assert isinstance(result.data.title, str)
        assert isinstance(result.data.description, str)
        assert isinstance(result.data.links, list)
        assert len(result.data.title) > 0
        assert len(result.data.description) > 0
        
        # Links validation
        for link in result.data.links:
            assert isinstance(link, str)
            assert len(link) > 0
            # Links should be valid URLs or relative paths
            assert link.startswith(("http://", "https://", "/", "#")) or "." in link

@pytest.mark.asyncio
async def test_extract_with_system_prompt():
    """Test extraction with custom system prompt."""
    class SystemPromptSchema(BaseModel):
        title: str
        summary: str
    
    result = await app.extract(
        ["https://example.com"],
        prompt="Extract the title and create a brief summary",
        schema=SystemPromptSchema,
        system_prompt="You are an expert content analyzer. Focus on accuracy and brevity."
    )
    
    # Basic response assertions
    assert result is not None
    assert result.success
    assert hasattr(result, "data")
    assert result.data is not None
    
    # Error handling assertions
    assert hasattr(result, "error")
    assert result.error is None
    
    # Sources validation
    assert hasattr(result, "sources")
    if result.sources is not None:
        if isinstance(result.sources, dict):
            # Sources returned as dictionary with keys like 'links[0]'
            for key, source_list in result.sources.items():
                assert isinstance(key, str)
                assert isinstance(source_list, list)
                for source_url in source_list:
                    assert isinstance(source_url, str)
                    assert len(source_url) > 0
                    # Sources should be valid URLs
                    assert source_url.startswith(("http://", "https://"))
        elif isinstance(result.sources, list):
            # Sources returned as simple list (fallback)
            for source in result.sources:
                assert isinstance(source, str)
                assert len(source) > 0
    
    # Handle both dictionary and object responses
    if isinstance(result.data, dict):
        # Data returned as dictionary
        assert "title" in result.data
        assert "summary" in result.data
        assert isinstance(result.data["title"], str)
        assert isinstance(result.data["summary"], str)
        assert len(result.data["title"]) > 0
        assert len(result.data["summary"]) > 0
    else:
        # Data returned as Pydantic model object
        assert hasattr(result.data, "title")
        assert hasattr(result.data, "summary")
        assert isinstance(result.data.title, str)
        assert isinstance(result.data.summary, str)
        assert len(result.data.title) > 0
        assert len(result.data.summary) > 0 