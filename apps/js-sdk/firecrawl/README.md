# Firecrawl JavaScript SDK

The Firecrawl JavaScript SDK is a library that allows you to easily scrape and crawl websites, and output the data in a format ready for use with language models (LLMs). It provides a simple and intuitive interface for interacting with the Firecrawl API.

## Installation

To install the Firecrawl JavaScript SDK, you can use npm:

```bash
npm install @mendable/firecrawl-js
```

## Usage

1. Get an API key from [firecrawl.dev](https://firecrawl.dev)
2. Set the API key as an environment variable named `FIRECRAWL_API_KEY` or pass it as a parameter to the `FirecrawlApp` class.


Here's an example of how to use the SDK with error handling:

```js
  import FirecrawlApp from '@mendable/firecrawl-js';

  async function main() {
    try {
      // Initialize the FirecrawlApp with your API key
      const app = new FirecrawlApp({ apiKey: "YOUR_API_KEY" });

      // Scrape a single URL
      const url = 'https://mendable.ai';
      const scrapedData = await app.scrapeUrl(url);
      console.log(scrapedData);
      
      // Crawl a website
      const crawlUrl = 'https://mendable.ai';
      const params = {
      crawlerOptions: {
        excludes: ['blog/'],
        includes: [], // leave empty for all pages 
        limit: 1000,
        },
        pageOptions: {
            onlyMainContent: true
        }
      };

      const crawlResult = await app.crawlUrl(crawlUrl, params);
      console.log(crawlResult);

    } catch (error) {
      console.error('An error occurred:', error.message);
    }
  }

  main();
```

### Scraping a URL

To scrape a single URL with error handling, use the `scrapeUrl` method. It takes the URL as a parameter and returns the scraped data as a dictionary.

```js
  async function scrapeExample() {
    try {
      const url = 'https://example.com';
      const scrapedData = await app.scrapeUrl(url);
      console.log(scrapedData);

    } catch (error) {
      console.error(
        'Error occurred while scraping:',
        error.message
      );
    }
  }
  
  scrapeExample();
```


### Crawling a Website

To crawl a website with error handling, use the `crawlUrl` method. It takes the starting URL and optional parameters as arguments. The `params` argument allows you to specify additional options for the crawl job, such as the maximum number of pages to crawl, allowed domains, and the output format.

```js
async function crawlExample() {
  try {
    const crawlUrl = 'https://example.com';
    const params = {
      crawlerOptions: {
        excludes: ['blog/'],
        includes: [], // leave empty for all pages
        limit: 1000,
      },
      pageOptions: {
        onlyMainContent: true
      }
    };
    const waitUntilDone = true;
    const timeout = 5;
    const crawlResult = await app.crawlUrl(
      crawlUrl,
      params,
      waitUntilDone,
      timeout
    );

    console.log(crawlResult);

  } catch (error) {
    console.error(
      'Error occurred while crawling:',
      error.message
    );
  }
}

crawlExample();
```


### Checking Crawl Status

To check the status of a crawl job with error handling, use the `checkCrawlStatus` method. It takes the job ID as a parameter and returns the current status of the crawl job.

```js
async function checkStatusExample(jobId) {
  try {
    const status = await app.checkCrawlStatus(jobId);
    console.log(status);

  } catch (error) {
    console.error(
      'Error occurred while checking crawl status:',
      error.message
    );
  }
}
// Example usage, assuming you have a jobId
checkStatusExample('your_job_id_here');
```


## Error Handling

The SDK handles errors returned by the Firecrawl API and raises appropriate exceptions. If an error occurs during a request, an exception will be raised with a descriptive error message. The examples above demonstrate how to handle these errors using `try/catch` blocks.

## Contributing

Contributions to the Firecrawl JavaScript SDK are welcome! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request on the GitHub repository.

## License

The Firecrawl JavaScript SDK is open-source and released under the [MIT License](https://opensource.org/licenses/MIT).
