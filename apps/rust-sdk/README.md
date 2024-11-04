# Firecrawl Rust SDK
The Firecrawl Rust SDK is a library that allows you to easily scrape and crawl websites, and output the data in a format ready for use with language models (LLMs). It provides a simple and intuitive interface for interacting with the Firecrawl API.

## Installation

To install the Firecrawl Rust SDK, add the following to your `Cargo.toml`:

```toml
[dependencies]
firecrawl = "^0.1"
tokio = { version = "^1", features = ["full"] }
```

To add it in your codebase.

## Usage

First, you need to obtain an API key from [firecrawl.dev](https://firecrawl.dev). Then, you need to initialize the `FirecrawlApp` like so:

```rust
use firecrawl::FirecrawlApp;

#[tokio::main]
async fn main() {
    // Initialize the FirecrawlApp with the API key
    let app = FirecrawlApp::new("fc-YOUR-API-KEY").expect("Failed to initialize FirecrawlApp");

    // ...
}
```

### Scraping a URL

To scrape a single URL, use the `scrape_url` method. It takes the URL as a parameter and returns the scraped data as a `Document`.

```rust
let scrape_result = app.scrape_url("https://firecrawl.dev", None).await;
match scrape_result {
    Ok(data) => println!("Scrape result:\n{}", data.markdown),
    Err(e) => eprintln!("Scrape failed: {}", e),
}
```

### Scraping with Extract

With Extract, you can easily extract structured data from any URL. You need to specify your schema in the JSON Schema format, using the `serde_json::json!` macro.

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

let llm_extraction_options = ScrapeOptions {
    formats: vec![ ScrapeFormats::Extract ].into(),
    extract: ExtractOptions {
        schema: json_schema.into(),
        ..Default::default()
    }.into(),
    ..Default::default()
};

let llm_extraction_result = app
    .scrape_url("https://news.ycombinator.com", llm_extraction_options)
    .await;

match llm_extraction_result {
    Ok(data) => println!("LLM Extraction Result:\n{:#?}", data.extract.unwrap()),
    Err(e) => eprintln!("LLM Extraction failed: {}", e),
}
```

### Crawling a Website

To crawl a website, use the `crawl_url` method. This will wait for the crawl to complete, which may take a long time based on your starting URL and your options.

```rust
let crawl_options = CrawlOptions {
    exclude_paths: vec![ "blog/*".into() ].into(),
    ..Default::default()
};

let crawl_result = app
    .crawl_url("https://mendable.ai", crawl_options)
    .await;

match crawl_result {
    Ok(data) => println!("Crawl Result (used {} credits):\n{:#?}", data.credits_used, data.data),
    Err(e) => eprintln!("Crawl failed: {}", e),
}
```

#### Crawling asynchronously

To crawl without waiting for the result, use the `crawl_url_async` method. It takes the same parameters, but it returns a `CrawlAsyncRespone` struct, containing the crawl's ID. You can use that ID with the `check_crawl_status` method to check the status at any time. Do note that completed crawls are deleted after 24 hours.

```rust
let crawl_id = app.crawl_url_async("https://mendable.ai", None).await?.id;

// ... later ...

let status = app.check_crawl_status(crawl_id).await?;

if status.status == CrawlStatusTypes::Completed {
    println!("Crawl is done: {:#?}", status.data);
} else {
    // ... wait some more ...
}
```

### Map a URL (Alpha)

Map all associated links from a starting URL.

```rust
let map_result = app
    .map_url("https://firecrawl.dev", None)
    .await;

match map_result {
    Ok(data) => println!("Mapped URLs: {:#?}", data),
    Err(e) => eprintln!("Map failed: {}", e),
}
```

## Error Handling

The SDK handles errors returned by the Firecrawl API and by our dependencies, and combines them into the `FirecrawlError` enum, implementing `Error`, `Debug` and `Display`. All of our methods return a `Result<T, FirecrawlError>`.

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
