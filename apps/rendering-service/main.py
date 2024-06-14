"""
This module provides a FastAPI application that uses Playwright to fetch and return
the HTML content of a specified URL. It supports optional proxy settings and media blocking.
"""

import json
from os import environ
from urllib.parse import urlencode

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from httpx import AsyncClient

BROWSER_TOKEN = environ.get("BROWSER_TOKEN", None)
BROWSER_ENDPOINT = environ.get("BROWSER_ENDPOINT", None)
PROXY_SERVER = environ.get("PROXY_SERVER", None)
PROXY_USERNAME = environ.get("PROXY_USERNAME", None)
PROXY_PASSWORD = environ.get("PROXY_PASSWORD", None)
BLOCK_MEDIA = environ.get("BLOCK_MEDIA", "False").upper() == "TRUE"
PROXY = PROXY_SERVER and PROXY_PASSWORD and PROXY_PASSWORD

app = FastAPI()

class UrlModel(BaseModel):
    """Model representing the URL and associated parameters for the request."""
    url: str
    wait_after_load: int = 0
    timeout: int = 15000
    headers: dict = None

@app.post("/html")
async def root(body: UrlModel):
    """
    Endpoint to fetch and return HTML content of a given URL.
    
    Args:
        body (UrlModel): The URL model containing the target URL, wait time, and timeout.
    
    Returns:
        JSONResponse: The HTML content of the page.
    """
    launch_options = urlencode({
        "token": BROWSER_TOKEN,
        "blockAds": json.dumps(True),  # enable uBlock Origin extension to block ads
        "launch":json.dumps({
            'ignoreHTTPSErrors': True,
            'args':[f'--proxy-server={PROXY_SERVER}'] if PROXY else [],
            # 'stealth': True  # bypass anti-bot measures
        }),
        "timeout": body.timeout  # navigation timeout
    })

    payload = {
        'url': body.url,
        'bestAttempt': True,  # return page content regardless of event errors
        'setExtraHTTPHeaders': body.headers if body.headers else {},
        'rejectResourceTypes': [
            'media',
            'image',
        ] if BLOCK_MEDIA else [],
        'authenticate': {
            'username': PROXY_USERNAME,
            'password': PROXY_PASSWORD,
        } if PROXY else None,
        'waitForTimeout': body.wait_after_load
    }
    content_endpoint = BROWSER_ENDPOINT + f"/content?{launch_options}"

    async with AsyncClient() as client:
        response = await client.post(
            url=content_endpoint,
            json=payload,
            timeout=None
        )
        json_compatible_item_data = {"content": response.text}
    return JSONResponse(content=json_compatible_item_data)
