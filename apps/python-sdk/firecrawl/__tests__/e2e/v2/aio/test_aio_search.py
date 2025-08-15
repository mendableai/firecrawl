import os
import pytest
from dotenv import load_dotenv
from firecrawl import AsyncFirecrawl
from firecrawl.v2.types import ScrapeOptions, ScrapeFormats, SearchData, SearchResult, Document


def _collect_texts(entries):
    texts = []
    for r in entries or []:
        title = getattr(r, 'title', None) if hasattr(r, 'title') else None
        desc = getattr(r, 'description', None) if hasattr(r, 'description') else None
        if title:
            texts.append(str(title).lower())
        if desc:
            texts.append(str(desc).lower())
    return texts

def _is_document(entry) -> bool:
    try:
        from firecrawl.v2.types import Document
        return isinstance(entry, Document) or \
               hasattr(entry, 'markdown') or \
               hasattr(entry, 'html') or \
               hasattr(entry, 'raw_html') or \
               hasattr(entry, 'json') or \
               hasattr(entry, 'screenshot') or \
               hasattr(entry, 'change_tracking') or \
               hasattr(entry, 'summary')
    except Exception:
        return hasattr(entry, 'markdown') or \
               hasattr(entry, 'html') or \
               hasattr(entry, 'raw_html') or \
               hasattr(entry, 'json') or \
               hasattr(entry, 'screenshot') or \
               hasattr(entry, 'change_tracking') or \
               hasattr(entry, 'summary')


load_dotenv()

if not os.getenv("API_KEY"):
    raise ValueError("API_KEY is not set")

if not os.getenv("API_URL"):
    raise ValueError("API_URL is not set")


@pytest.mark.asyncio
async def test_async_search_minimal():
    client = AsyncFirecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))
    data = await client.search("What is the capital of France?")
    # Assert sections like sync tests
    assert hasattr(data, "web")
    assert hasattr(data, "news")
    assert hasattr(data, "images")
    assert data.web is not None
    assert len(data.web) > 0
    titles = [getattr(r, "title", None) for r in data.web]
    descs = [getattr(r, "description", None) for r in data.web]
    all_text = " ".join([t.lower() for t in titles if t] + [d.lower() for d in descs if d])
    assert "paris" in all_text
    assert data.news is None
    assert data.images is None


@pytest.mark.asyncio
async def test_async_search_with_sources_and_limit():
    client = AsyncFirecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))
    data = await client.search("firecrawl", sources=["web", "news"], limit=3)
    # Sections present
    assert hasattr(data, "web") and hasattr(data, "news") and hasattr(data, "images")
    # Web present, images absent, news optional but if present respects limit
    if data.web is not None:
        assert len(data.web) <= 3
    if data.news is not None:
        assert len(data.news) <= 3
    assert data.images is None


@pytest.mark.asyncio
async def test_async_search_with_all_params():
    client = AsyncFirecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))
    data = await client.search(
        "artificial intelligence",
        sources=["web", "news"],
        limit=3,
        tbs="qdr:w",
        location="US",
        ignore_invalid_urls=False,
        timeout=30000,
        scrape_options={
            "formats": ["markdown"],
            "headers": {"User-Agent": "E2E-AIO"},
            "include_tags": ["h1"],
            "exclude_tags": ["nav"],
            "only_main_content": False,
            "timeout": 15000,
            "wait_for": 2000,
            "mobile": True,
            "skip_tls_verification": True,
            "remove_base64_images": False,
        },
    )
    # Structure and type assertions mirroring sync
    assert isinstance(data, SearchData)
    assert hasattr(data, "web") and hasattr(data, "news") and hasattr(data, "images")
    assert data.web is not None
    assert len(data.web) <= 3
    non_doc = [r for r in (data.web or []) if not _is_document(r)]
    if non_doc:
        combined = " ".join(_collect_texts(non_doc))
        ai_terms = ["artificial", "intelligence", "ai", "machine", "learning"]
        assert any(term in combined for term in ai_terms)
    for r in data.web:
        assert isinstance(r, (SearchResult, Document))
        if isinstance(r, Document):
            assert (r.markdown is not None) or (r.html is not None)
        else:
            assert hasattr(r, "url")
            assert isinstance(r.url, str) and r.url.startswith("http")
    if data.news is not None:
        assert len(data.news) <= 10
        for r in data.news:
            assert isinstance(r, (SearchResult, Document))
            if isinstance(r, Document):
                assert (r.markdown is not None) or (r.html is not None)
            else:
                assert isinstance(r.url, str) and r.url.startswith("http")
    assert data.images is None


@pytest.mark.asyncio
async def test_async_search_minimal_content_check():
    """Stronger assertion similar to sync: content check on a known query."""
    client = AsyncFirecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))
    data = await client.search("What is the capital of France?")
    assert hasattr(data, "web") and data.web is not None
    non_doc = [r for r in (data.web or []) if not _is_document(r)]
    if non_doc:
        combined = " ".join(_collect_texts(non_doc))
        assert "paris" in combined


@pytest.mark.asyncio
async def test_async_search_result_structure():
    client = AsyncFirecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))
    data = await client.search("test query", limit=1)
    if data.web and len(data.web) > 0:
        result = data.web[0]
        assert hasattr(result, "url")
        assert hasattr(result, "title")
        assert hasattr(result, "description")
        assert isinstance(result.url, str) and result.url.startswith("http")
        assert isinstance(getattr(result, "title", None), (str, type(None)))
        assert isinstance(getattr(result, "description", None), (str, type(None)))


@pytest.mark.asyncio
async def test_async_search_formats_flexibility():
    client = AsyncFirecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))
    # list string
    res1 = await client.search("python programming", limit=1, scrape_options=ScrapeOptions(formats=["markdown"]))
    # list objects
    res2 = await client.search("python programming", limit=1, scrape_options=ScrapeOptions(formats=[{"type": "markdown"}]))
    # ScrapeFormats object
    res3 = await client.search("python programming", limit=1, scrape_options=ScrapeOptions(formats=ScrapeFormats(markdown=True)))
    assert isinstance(res1, SearchData) and hasattr(res1, "web")
    assert isinstance(res2, SearchData) and hasattr(res2, "web")
    assert isinstance(res3, SearchData) and hasattr(res3, "web")


@pytest.mark.asyncio
async def test_async_search_json_format_object():
    client = AsyncFirecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))
    json_schema = {"type": "object", "properties": {"title": {"type": "string"}}, "required": ["title"]}
    data = await client.search(
        "site:docs.firecrawl.dev",
        limit=1,
        scrape_options={"formats": [{"type": "json", "prompt": "Extract page title", "schema": json_schema}]},
    )
    assert hasattr(data, "web")

