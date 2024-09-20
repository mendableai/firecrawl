use firecrawl::{crawl::CrawlOptions, scrape::{ExtractOptions, ScrapeFormats, ScrapeOptions}, FirecrawlApp};
use serde_json::json;
use uuid::Uuid;

#[tokio::main]
async fn main() {
    // Initialize the FirecrawlApp with the API key
    let app = FirecrawlApp::new("fc-YOUR-API-KEY").expect("Failed to initialize FirecrawlApp");

    // or, connect to a self-hosted instance:
    // let app = FirecrawlApp::new_selfhosted("http://localhost:3002", None).expect("Failed to initialize FirecrawlApp");

    // Scrape a website
    let scrape_result = app.scrape_url("https://firecrawl.dev", None).await;
    match scrape_result {
        Ok(data) => println!("Scrape Result:\n{}", data.markdown.unwrap()),
        Err(e) => eprintln!("Scrape failed: {:#?}", e),
    }

    // Crawl a website
    let idempotency_key = String::from(Uuid::new_v4());
    let crawl_options = CrawlOptions {
        exclude_paths: Some(vec![ "blog/*".to_string() ]),
        poll_interval: Some(2000),
        idempotency_key: Some(idempotency_key),
        ..Default::default()
    };
    let crawl_result = app
        .crawl_url(
            "https://mendable.ai",
            crawl_options,
        )
        .await;
    match crawl_result {
        Ok(data) => println!("Crawl Result (used {} credits):\n{:#?}", data.credits_used, data.data),
        Err(e) => eprintln!("Crawl failed: {}", e),
    }

    // LLM Extraction with a JSON schema
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
        formats: Some(vec![ ScrapeFormats::Extract ]),
        extract: Some(ExtractOptions {
            schema: Some(json_schema),
            ..Default::default()
        }),
        ..Default::default()
    };

    let llm_extraction_result = app
        .scrape_url("https://news.ycombinator.com", llm_extraction_options)
        .await;
    match llm_extraction_result {
        Ok(data) => println!("LLM Extraction Result:\n{:#?}", data.extract.unwrap()),
        Err(e) => eprintln!("LLM Extraction failed: {}", e),
    }
}
