from fastapi import FastAPI, Response
from playwright.async_api import async_playwright
import os
from fastapi.responses import JSONResponse
from pydantic import BaseModel
app = FastAPI()

from pydantic import BaseModel

class UrlModel(BaseModel):
    url: str

@app.post("/html")  # Kept as POST to accept body parameters
async def root(body: UrlModel):  # Using Pydantic model for request body
    async with async_playwright() as p:
        browser = await p.chromium.launch()

        context = await browser.new_context()
        page = await context.new_page()

        await page.goto(body.url)  # Adjusted to use the url from the request body model
        page_content = await page.content()  # Get the HTML content of the page

        await context.close()
        await browser.close()

        json_compatible_item_data = {"content": page_content}
        return JSONResponse(content=json_compatible_item_data)
    
