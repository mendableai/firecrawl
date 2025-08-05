from firecrawl import Firecrawl
import os
import pytest
from dotenv import load_dotenv
# from pydantic import BaseModel
# from firecrawl.types import ScrapeOptions, JsonFormat, Location, WaitAction, SourceOptions, FormatOptions

load_dotenv()

if not os.getenv("API_KEY"):
    raise ValueError("API_KEY is not set")

if not os.getenv("API_URL"):
    raise ValueError("API_URL is not set")

firecrawl = Firecrawl(api_key=os.getenv("API_KEY"), api_url=os.getenv("API_URL"))

def test_search_minimal_request():
    search_response = firecrawl.search(
      query="What is the capital of France?"
    )
    
    print(f"Success: {search_response.success}")
    print(f"Data: {search_response.data}")
    print(f"Warning: {search_response.warning}")
# @pytest.mark.e2e
# def test_search_images_request():
#     search_response = firecrawl.search(
#       query="What is the capital of France?",
#       sources=[ "images" ],
#       limit=5
#     )
    
#     print(search_response)

# @pytest.mark.e2e
# def test_search_all_options():
#     class Schema(BaseModel):
#       name: str
#       description: str
#       type: str
#       required: bool

#     search_response = firecrawl.search(
#       query="What is the capital of France?",
#       sources=[
#           { type: "web" },
#           { type: "news" },
#           { type: "images" }
#       ],
#       limit=10,
#       tbs="",
#       location="",
#       timeout=60000,
#       ignore_invalid_urls=False,
#       scrape_options=ScrapeOptions(
#         formats=[
#             'markdown',
#             JsonFormat(
#               schema={},
#               prompt=""
#             )
#         ],
#         only_main_content=True,
#         # include_tags=["<string>"], # TODO: check this
#         # exclude_tags=["<string>"], # TODO: check this
#         max_age=0,
#         headers={},
#         wait_for=0,
#         mobile=False,
#         skip_tls_verification=False,
#         timeout=30000,
#         parsers=[ 'pdf' ],
#         actions=[
#             WaitAction(milliseconds=2000)
#         ],
#         location=Location(
#             country="US",
#             languages=["en-US"]
#         ),
#         remove_base64_images=True,
#         block_ads=True,
#         proxy="basic",
#         store_in_cache=True,
#       )
#     )