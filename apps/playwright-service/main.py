from fastapi import FastAPI
from playwright.async_api import async_playwright, Browser
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from os import environ

PROXY_SERVER = environ.get('PROXY_SERVER', None)
PROXY_USERNAME = environ.get('PROXY_USERNAME', None)
PROXY_PASSWORD = environ.get('PROXY_PASSWORD', None)
BLOCK_MEDIA = environ.get('BLOCK_MEDIA', 'False').upper() == 'TRUE'

app = FastAPI()


class UrlModel(BaseModel):
    url: str
    wait: int = None
    timeout: int = 15000


browser: Browser = None


@app.on_event("startup")
async def startup_event():
    global browser
    playwright = await async_playwright().start()
    browser = await playwright.chromium.launch()


@app.on_event("shutdown")
async def shutdown_event():
    await browser.close()


@app.post("/html")
async def root(body: UrlModel):
    context = None
    if PROXY_SERVER and PROXY_USERNAME and PROXY_PASSWORD:
        context = await browser.new_context(proxy={"server": PROXY_SERVER,
                                                   "username": PROXY_USERNAME,
                                                   "password": PROXY_PASSWORD})
    else:
        context = await browser.new_context()

    if BLOCK_MEDIA:
        await context.route("**/*.{png,jpg,jpeg,gif,svg,mp3,mp4,avi,flac,ogg,wav,webm}",
                            handler=lambda route, request: route.abort())

    page = await context.new_page()
    await page.goto(
        body.url,
        wait_until="load",
        timeout=body.timeout,
    )
    # Wait != timeout. Wait is the time to wait after the page is loaded - useful in some cases were "load" / "networkidle" is not enough
    if body.wait:
        await page.wait_for_timeout(body.wait)
        
    page_content = await page.content()
    await context.close()
    json_compatible_item_data = {"content": page_content}
    return JSONResponse(content=json_compatible_item_data)
