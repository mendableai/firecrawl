import pytest
from firecrawl.v2.methods.browser import browser
from firecrawl.v2.methods.aio import browser as async_browser


class _FakeResponse:
    ok = True
    status_code = 200

    def json(self):
        return {"success": True, "id": "session-1"}


class _FakeClient:
    def __init__(self):
        self.last_post = None

    def post(self, endpoint, payload):
        self.last_post = (endpoint, payload)
        return _FakeResponse()


class _FakeAsyncClient(_FakeClient):
    async def post(self, endpoint, payload):
        return super().post(endpoint, payload)


def test_browser_sends_location():
    client = _FakeClient()
    browser(client, location={"country": "GB"})
    assert client.last_post == ("/v2/browser", {"location": {"country": "GB"}})


def test_browser_omits_location_by_default():
    client = _FakeClient()
    browser(client)
    assert client.last_post == ("/v2/browser", {})


@pytest.mark.asyncio
async def test_async_browser_sends_location():
    client = _FakeAsyncClient()
    await async_browser.browser(client, location={"country": "GB"})
    assert client.last_post == ("/v2/browser", {"location": {"country": "GB"}})


@pytest.mark.parametrize("record_session", [True, False, None])
def test_browser_record_session_with_other_options(record_session):
    client = _FakeClient()
    browser(client, record_session=record_session, block_ads=False, location={"country": "GB"})
    payload = {"blockAds": False, "location": {"country": "GB"}}
    if record_session is not None:
        payload["recordSession"] = record_session
    assert client.last_post == ("/v2/browser", payload)


@pytest.mark.asyncio
@pytest.mark.parametrize("record_session", [True, False, None])
async def test_async_browser_record_session_with_other_options(record_session):
    client = _FakeAsyncClient()
    await async_browser.browser(client, record_session=record_session, block_ads=False, location={"country": "GB"})
    payload = {"blockAds": False, "location": {"country": "GB"}}
    if record_session is not None:
        payload["recordSession"] = record_session
    assert client.last_post == ("/v2/browser", payload)
