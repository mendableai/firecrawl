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
from firecrawl import FirecrawlApp

# Initialize the FirecrawlApp with your API key
app = FirecrawlApp(api_key='your_api_key')

# Scrape a single URL
url = 'https://mendable.ai'
scraped_data = app.scrape_url(url)

# Crawl a website
crawl_url = 'https://mendable.ai'
params = {
    'pageOptions': {
        'onlyMainContent': True
    }
}
crawl_result = app.crawl_url(crawl_url, params=params)
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

### Search for a query

Used to search the web, get the most relevant results, scrap each page and return the markdown.

```python
query = 'what is mendable?'
search_result = app.search(query)
```

### Crawling a Website

To crawl a website, use the `crawl_url` method. It takes the starting URL and optional parameters as arguments. The `params` argument allows you to specify additional options for the crawl job, such as the maximum number of pages to crawl, allowed domains, and the output format.

The `wait_until_done` parameter determines whether the method should wait for the crawl job to complete before returning the result. If set to `True`, the method will periodically check the status of the crawl job until it is completed or the specified `timeout` (in seconds) is reached. If set to `False`, the method will return immediately with the job ID, and you can manually check the status of the crawl job using the `check_crawl_status` method.

```python
crawl_url = 'https://example.com'
params = {
    'crawlerOptions': {
        'excludes': ['blog/*'],
        'includes': [], # leave empty for all pages
        'limit': 1000,
    },
    'pageOptions': {
        'onlyMainContent': True
    }
}
crawl_result = app.crawl_url(crawl_url, params=params, wait_until_done=True, timeout=5)
```

If `wait_until_done` is set to `True`, the `crawl_url` method will return the crawl result once the job is completed. If the job fails or is stopped, an exception will be raised.

### Checking Crawl Status

To check the status of a crawl job, use the `check_crawl_status` method. It takes the job ID as a parameter and returns the current status of the crawl job.

```python
job_id = crawl_result['jobId']
status = app.check_crawl_status(job_id)
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
