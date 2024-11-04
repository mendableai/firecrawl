# Firecrawl Python SDK

The Firecrawl Python SDK is a library that allows you to easily scrape and crawl websites, and output the data in a format ready for use with language models (LLMs). It provides a simple and intuitive interface for interacting with the Firecrawl API.

## Installation

To install the Firecrawl Python SDK, you can use pip:

```bash
pip install firecrawl-py
```

## Usage

1. Get an API key from [firecrawl.dev](https://firecrawl.dev)
2. Set the API key as an environment variable named `FIRECRAWL_API_KEY` or pass it as a parameter to the `FirecrawlApp` class.

Here's an example of how to use the SDK:

```python
from firecrawl.firecrawl import FirecrawlApp

app = FirecrawlApp(api_key="fc-YOUR_API_KEY")

# Scrape a website:
scrape_status = app.scrape_url(
  'https://firecrawl.dev', 
  params={'formats': ['markdown', 'html']}
)
print(scrape_status)

# Crawl a website:
crawl_status = app.crawl_url(
  'https://firecrawl.dev', 
  params={
    'limit': 100, 
    'scrapeOptions': {'formats': ['markdown', 'html']}
  }, 
  poll_interval=30
)
print(crawl_status)
```

### Scraping a URL

To scrape a single URL, use the `scrape_url` method. It takes the URL as a parameter and returns the scraped data as a dictionary.

```python
url = 'https://example.com'
scraped_data = app.scrape_url(url)
```

### Extracting structured data from a URL

With LLM extraction, you can easily extract structured data from any URL. We support pydantic schemas to make it easier for you too. Here is how you to use it:

```python
class ArticleSchema(BaseModel):
    title: str
    points: int
    by: str
    commentsURL: str

class TopArticlesSchema(BaseModel):
    top: List[ArticleSchema] = Field(..., max_items=5, description="Top 5 stories")

data = app.scrape_url('https://news.ycombinator.com', {
    'extractorOptions': {
        'extractionSchema': TopArticlesSchema.model_json_schema(),
        'mode': 'llm-extraction'
    },
    'pageOptions':{
        'onlyMainContent': True
    }
})
print(data["llm_extraction"])
```

### Crawling a Website

To crawl a website, use the `crawl_url` method. It takes the starting URL and optional parameters as arguments. The `params` argument allows you to specify additional options for the crawl job, such as the maximum number of pages to crawl, allowed domains, and the output format.

```python
idempotency_key = str(uuid.uuid4()) # optional idempotency key
crawl_result = app.crawl_url('firecrawl.dev', {'excludePaths': ['blog/*']}, 2, idempotency_key)
print(crawl_result)
```

### Asynchronous Crawl a Website

To crawl a website asynchronously, use the `async_crawl_url` method. It takes the starting URL and optional parameters as arguments. The `params` argument allows you to specify additional options for the crawl job, such as the maximum number of pages to crawl, allowed domains, and the output format.

```python
crawl_result = app.async_crawl_url('firecrawl.dev', {'excludePaths': ['blog/*']}, "")
print(crawl_result)
```

### Checking Crawl Status

To check the status of a crawl job, use the `check_crawl_status` method. It takes the job ID as a parameter and returns the current status of the crawl job.

```python
id = crawl_result['id']
status = app.check_crawl_status(id)
```

### Map a Website

Use `map_url` to generate a list of URLs from a website. The `params` argument let you customize the mapping process, including options to exclude subdomains or to utilize the sitemap.

```python
# Map a website:
map_result = app.map_url('https://example.com')
print(map_result)
```

### Crawl a website with WebSockets

To crawl a website with WebSockets, use the `crawl_url_and_watch` method. It takes the starting URL and optional parameters as arguments. The `params` argument allows you to specify additional options for the crawl job, such as the maximum number of pages to crawl, allowed domains, and the output format.

```python
# inside an async function...
nest_asyncio.apply()

# Define event handlers
def on_document(detail):
    print("DOC", detail)

def on_error(detail):
    print("ERR", detail['error'])

def on_done(detail):
    print("DONE", detail['status'])

    # Function to start the crawl and watch process
async def start_crawl_and_watch():
    # Initiate the crawl job and get the watcher
    watcher = app.crawl_url_and_watch('firecrawl.dev', { 'excludePaths': ['blog/*'], 'limit': 5 })

    # Add event listeners
    watcher.add_event_listener("document", on_document)
    watcher.add_event_listener("error", on_error)
    watcher.add_event_listener("done", on_done)

    # Start the watcher
    await watcher.connect()

# Run the event loop
await start_crawl_and_watch()
```

### Scraping multiple URLs in batch

To batch scrape multiple URLs, use the `batch_scrape_urls` method. It takes the URLs and optional parameters as arguments. The `params` argument allows you to specify additional options for the scraper such as the output formats.

```python
idempotency_key = str(uuid.uuid4()) # optional idempotency key
batch_scrape_result = app.batch_scrape_urls(['firecrawl.dev', 'mendable.ai'], {'formats': ['markdown', 'html']}, 2, idempotency_key)
print(batch_scrape_result)
```

### Asynchronous batch scrape

To run a batch scrape asynchronously, use the `async_batch_scrape_urls` method. It takes the starting URL and optional parameters as arguments. The `params` argument allows you to specify additional options for the scraper, such as the output formats.

```python
batch_scrape_result = app.async_batch_scrape_urls(['firecrawl.dev', 'mendable.ai'], {'formats': ['markdown', 'html']})
print(batch_scrape_result)
```

### Checking batch scrape status

To check the status of an asynchronous batch scrape job, use the `check_batch_scrape_status` method. It takes the job ID as a parameter and returns the current status of the batch scrape job.

```python
id = batch_scrape_result['id']
status = app.check_batch_scrape_status(id)
```

### Batch scrape with WebSockets

To use batch scrape with WebSockets, use the `batch_scrape_urls_and_watch` method. It takes the starting URL and optional parameters as arguments. The `params` argument allows you to specify additional options for the scraper, such as the output formats.

```python
# inside an async function...
nest_asyncio.apply()

# Define event handlers
def on_document(detail):
    print("DOC", detail)

def on_error(detail):
    print("ERR", detail['error'])

def on_done(detail):
    print("DONE", detail['status'])

# Function to start the crawl and watch process
async def start_crawl_and_watch():
    # Initiate the crawl job and get the watcher
    watcher = app.batch_scrape_urls_and_watch(['firecrawl.dev', 'mendable.ai'], {'formats': ['markdown', 'html']})

    # Add event listeners
    watcher.add_event_listener("document", on_document)
    watcher.add_event_listener("error", on_error)
    watcher.add_event_listener("done", on_done)

    # Start the watcher
    await watcher.connect()

# Run the event loop
await start_crawl_and_watch()
```

## Error Handling

The SDK handles errors returned by the Firecrawl API and raises appropriate exceptions. If an error occurs during a request, an exception will be raised with a descriptive error message.

## Running the Tests with Pytest

To ensure the functionality of the Firecrawl Python SDK, we have included end-to-end tests using `pytest`. These tests cover various aspects of the SDK, including URL scraping, web searching, and website crawling.

### Running the Tests

To run the tests, execute the following commands:

Install pytest:

```bash
pip install pytest
```

Run:

```bash
pytest firecrawl/__tests__/e2e_withAuth/test.py
```

## Contributing

Contributions to the Firecrawl Python SDK are welcome! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request on the GitHub repository.

## License

The Firecrawl Python SDK is licensed under the MIT License. This means you are free to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the SDK, subject to the following conditions:

- The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Please note that while this SDK is MIT licensed, it is part of a larger project which may be under different licensing terms. Always refer to the license information in the root directory of the main project for overall licensing details.
