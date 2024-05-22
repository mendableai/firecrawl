from fastapi import FastAPI
from playwright.async_api import async_playwright, Browser
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI()


class UrlModel(BaseModel):
    url: str
    wait: int = None


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
    context = await browser.new_context()
    page = await context.new_page()
    await page.goto(
        body.url,
        wait_until="load",
        timeout=body.timeout if body.timeout else 15000,
    )
    # Wait != timeout. Wait is the time to wait after the page is loaded - useful in some cases were "load" / "networkidle" is not enough
    if body.wait:
        await page.wait_for_timeout(body.wait)
        
    page_content = await page.content()
    await context.close()
    json_compatible_item_data = {"content": page_content}
    return JSONResponse(content=json_compatible_item_data)
