# Firecrawl Rust SDK

The Firecrawl Rust SDK is a library that allows you to easily scrape and crawl websites, and output the data in a format ready for use with language models (LLMs). It provides a simple and intuitive interface for interacting with the Firecrawl API.

## Installation

To install the Firecrawl Rust SDK, add the following to your `Cargo.toml`:

```toml
[dependencies]
firecrawl = "^0.1"
tokio = { version = "^1", features = ["full"] }
serde = { version = "^1.0", features = ["derive"] }
serde_json = "^1.0"
uuid = { version = "^1.10", features = ["v4"] }

[build-dependencies]
tokio = { version = "1", features = ["full"] }
```

To add it in your codebase.

## Usage

1. Get an API key from [firecrawl.dev](https://firecrawl.dev)
2. Set the API key as an environment variable named `FIRECRAWL_API_KEY` or pass it as a parameter to the `FirecrawlApp` struct.

Here's an example of how to use the SDK in [example.rs](./examples/example.rs):
All below example can start with :
```rust
use firecrawl::FirecrawlApp;

#[tokio::main]
async fn main() {
    // Initialize the FirecrawlApp with the API key
    let api_key = ...;
    let api_url = ...;
    let app = FirecrawlApp::new(api_key, api_url).expect("Failed to initialize FirecrawlApp");

    // your code here...
}
```

### Scraping a URL

To scrape a single URL, use the `scrape_url` method. It takes the URL as a parameter and returns the scraped data as a `serde_json::Value`.

```rust
// Example scrape code...
let scrape_result = app.scrape_url("https://example.com", None).await;
match scrape_result {
    Ok(data) => println!("Scrape Result:\n{}", data["markdown"]),
    Err(e) => eprintln!("Scrape failed: {}", e),
}
```

### Extracting structured data from a URL

With LLM extraction, you can easily extract structured data from any URL. We support Serde for JSON schema validation to make it easier for you too. Here is how you use it:

```rust
let json_schema = json!({
    "type": "object",
    "properties": {
        "top": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "points": {"type": "number"},
                    "by": {"type": "string"},
                    "commentsURL": {"type": "string"}
                },
                "required": ["title", "points", "by", "commentsURL"]
            },
            "minItems": 5,
            "maxItems": 5,
            "description": "Top 5 stories on Hacker News"
        }
    },
    "required": ["top"]
});

let llm_extraction_params = json!({
    "extractorOptions": {
        "extractionSchema": json_schema,
        "mode": "llm-extraction"
    },
    "pageOptions": {
        "onlyMainContent": true
    }
});

// Example scrape code...
let llm_extraction_result = app
    .scrape_url("https://news.ycombinator.com", Some(llm_extraction_params))
    .await;
match llm_extraction_result {
    Ok(data) => println!("LLM Extraction Result:\n{}", data["llm_extraction"]),
    Err(e) => eprintln!("LLM Extraction failed: {}", e),
}
```

### Search for a query

Used to search the web, get the most relevant results, scrape each page, and return the markdown.

```rust
// Example query search code...
let query = "what is mendable?";
let search_result = app.search(query).await;
match search_result {
    Ok(data) => println!("Search Result:\n{}", data),
    Err(e) => eprintln!("Search failed: {}", e),
}
```

### Crawling a Website

To crawl a website, use the `crawl_url` method. It takes the starting URL and optional parameters as arguments. The `params` argument allows you to specify additional options for the crawl job, such as the maximum number of pages to crawl, allowed domains, and the output format.

The `wait_until_done` parameter determines whether the method should wait for the crawl job to complete before returning the result. If set to `true`, the method will periodically check the status of the crawl job until it is completed or the specified `timeout` (in seconds) is reached. If set to `false`, the method will return immediately with the job ID, and you can manually check the status of the crawl job using the `check_crawl_status` method.

```rust
let random_uuid = String::from(Uuid::new_v4());
let idempotency_key = Some(random_uuid); // optional idempotency key
let crawl_params = json!({
    "crawlerOptions": {
        "excludes": ["blog/*"]
    }
});

// Example crawl code...
let crawl_result = app
    .crawl_url("https://example.com", Some(crawl_params), true, 2, idempotency_key)
    .await;
match crawl_result {
    Ok(data) => println!("Crawl Result:\n{}", data),
    Err(e) => eprintln!("Crawl failed: {}", e),
}
```

If `wait_until_done` is set to `true`, the `crawl_url` method will return the crawl result once the job is completed. If the job fails or is stopped, an exception will be raised.

### Checking Crawl Status

To check the status of a crawl job, use the `check_crawl_status` method. It takes the job ID as a parameter and returns the current status of the crawl job.

```rust
let job_id = crawl_result["jobId"].as_str().expect("Job ID not found");
let status = app.check_crawl_status(job_id).await;
match status {
    Ok(data) => println!("Crawl Status:\n{}", data),
    Err(e) => eprintln!("Failed to check crawl status: {}", e),
}
```

## Error Handling

The SDK handles errors returned by the Firecrawl API and raises appropriate exceptions. If an error occurs during a request, an exception will be raised with a descriptive error message.

## Running the Tests with Cargo

To ensure the functionality of the Firecrawl Rust SDK, we have included end-to-end tests using `cargo`. These tests cover various aspects of the SDK, including URL scraping, web searching, and website crawling.

### Running the Tests

To run the tests, execute the following commands:
```bash
$ export $(xargs < ./tests/.env)
$ cargo test --test e2e_with_auth
```

## Contributing

Contributions to the Firecrawl Rust SDK are welcome! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request on the GitHub repository.

## License

The Firecrawl Rust SDK is open-source and released under the [AGPL License](https://www.gnu.org/licenses/agpl-3.0.en.html).
