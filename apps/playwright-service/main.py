"""
This module provides a FastAPI application that uses Playwright to fetch and return
the HTML content of a specified URL. It supports optional proxy settings and media blocking.
"""

from os import environ

from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
from playwright.async_api import Browser, async_playwright
from pydantic import BaseModel
from get_error import get_error

PROXY_SERVER = environ.get("PROXY_SERVER", None)
PROXY_USERNAME = environ.get("PROXY_USERNAME", None)
PROXY_PASSWORD = environ.get("PROXY_PASSWORD", None)
BLOCK_MEDIA = environ.get("BLOCK_MEDIA", "False").upper() == "TRUE"

app = FastAPI()

class UrlModel(BaseModel):
    """Model representing the URL and associated parameters for the request."""
    url: str
    wait_after_load: int = 0
    timeout: int = 15000
    headers: dict = None

browser: Browser = None

@app.on_event("startup")
async def startup_event():
    """Event handler for application startup to initialize the browser."""
    global browser
    playwright = await async_playwright().start()
    browser = await playwright.chromium.launch()

@app.on_event("shutdown")
async def shutdown_event():
    """Event handler for application shutdown to close the browser."""
    await browser.close()

@app.get("/health/liveness")
def liveness_probe():
    """Endpoint for liveness probe."""
    return JSONResponse(content={"status": "ok"}, status_code=200)


@app.get("/health/readiness")
async def readiness_probe():
    """Endpoint for readiness probe. Checks if the browser instance is ready."""
    if browser:
        return JSONResponse(content={"status": "ok"}, status_code=200)
    return JSONResponse(content={"status": "Service Unavailable"}, status_code=503)


@app.post("/html")
async def root(body: UrlModel):
    """
    Endpoint to fetch and return HTML content of a given URL.

    Args:
        body (UrlModel): The URL model containing the target URL, wait time, and timeout.

    Returns:
        JSONResponse: The HTML content of the page.
    """
    context = None
    if PROXY_SERVER and PROXY_USERNAME and PROXY_PASSWORD:
        context = await browser.new_context(
            proxy={
                "server": PROXY_SERVER,
                "username": PROXY_USERNAME,
                "password": PROXY_PASSWORD,
            }
        )
    else:
        context = await browser.new_context()

    if BLOCK_MEDIA:
        await context.route(
            "**/*.{png,jpg,jpeg,gif,svg,mp3,mp4,avi,flac,ogg,wav,webm}",
            handler=lambda route, request: route.abort(),
        )

    page = await context.new_page()

    # Set headers if provided
    if body.headers:
        await page.set_extra_http_headers(body.headers)

    response = await page.goto(
        body.url,
        wait_until="load",
        timeout=body.timeout,
    )
    page_status_code = response.status
    page_error = get_error(page_status_code)
    # Wait != timeout. Wait is the time to wait after the page is loaded - useful in some cases were "load" / "networkidle" is not enough
    if body.wait_after_load > 0:
        await page.wait_for_timeout(body.wait_after_load)

    page_content = await page.content()
    await context.close()
    json_compatible_item_data = {
        "content": page_content,
        "pageStatusCode": page_status_code,
        "pageError": page_error
      }
    return JSONResponse(content=json_compatible_item_data)