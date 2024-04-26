from fastapi import FastAPI
from playwright.async_api import async_playwright, Browser
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI()


class UrlModel(BaseModel):
    url: str


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
    await page.goto(body.url)
    page_content = await page.content()
    await context.close()
    json_compatible_item_data = {"content": page_content}
    return JSONResponse(content=json_compatible_item_data)
