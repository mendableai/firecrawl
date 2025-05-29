import os
import sys
import pytest
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../')))
from firecrawl.firecrawl import AsyncFirecrawlApp

load_dotenv()

API_URL = "https://api.firecrawl.dev"
API_KEY = os.getenv("TEST_API_KEY")

app = AsyncFirecrawlApp(api_url=API_URL, api_key=API_KEY)

class ExtractSchema(BaseModel):
    title: str
    description: str
    links: List[str]

@pytest.mark.asyncio
async def test_extract_async_simple_schema_class():
    result = await app.extract(
        ["https://example.com"],
        prompt="Extract the title, description, and links from the website",
        schema=ExtractSchema
    )
    assert result.success
    assert result.data is not None
    assert hasattr(result.data, "title")
    assert hasattr(result.data, "description")
    assert hasattr(result.data, "links")
    assert isinstance(result.data.links, list)

@pytest.mark.asyncio
async def test_extract_async_simple_schema_dict():
    result = await app.extract(
        ["https://example.com"],
        prompt="Extract the title, description, and links from the website",
        schema=ExtractSchema.schema()
    )
    assert result.success
    assert result.data is not None
    assert hasattr(result.data, "title")
    assert hasattr(result.data, "description")
    assert hasattr(result.data, "links")
    assert isinstance(result.data.links, list)

@pytest.mark.asyncio
async def test_extract_async_simple_schema_json():
    # Try both model_json_schema (Pydantic v2) and schema_json (Pydantic v1)
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
    assert result.success
    assert result.data is not None
    assert hasattr(result.data, "title")
    assert hasattr(result.data, "description")
    assert hasattr(result.data, "links")
    assert isinstance(result.data.links, list)

@pytest.mark.asyncio
async def test_extract_async_all_params():
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
        enable_web_search=True,
        show_sources=True,
        agent={"model": "FIRE-1"}
    )
    assert result.success
    assert result.data is not None
    assert hasattr(result.data, "title")
    assert hasattr(result.data, "description")
    assert hasattr(result.data, "links")
    assert hasattr(result.data, "author")
    assert isinstance(result.data.links, list)
    assert hasattr(result, "sources")
    assert isinstance(result.sources, list) 