use firecrawl::FirecrawlApp;
use serde_json::json;
use uuid::Uuid;

#[tokio::main]
async fn main() {
    // Initialize the FirecrawlApp with the API key
    let api_key = Some("fc-YOUR_API_KEY".to_string());
    let api_url = Some("http://0.0.0.0:3002".to_string());
    let app = FirecrawlApp::new(api_key, api_url).expect("Failed to initialize FirecrawlApp");

    // Scrape a website
    let scrape_result = app.scrape_url("https://firecrawl.dev", None).await;
    match scrape_result {
        Ok(data) => println!("Scrape Result:\n{}", data["markdown"]),
        Err(e) => eprintln!("Scrape failed: {}", e),
    }

    // Crawl a website
    let random_uuid = String::from(Uuid::new_v4());
    let idempotency_key = Some(random_uuid); // optional idempotency key
    let crawl_params = json!({
        "crawlerOptions": {
            "excludes": ["blog/*"]
        }
    });
    let crawl_result = app
        .crawl_url(
            "https://mendable.ai",
            Some(crawl_params),
            true,
            2,
            idempotency_key,
        )
        .await;
    match crawl_result {
        Ok(data) => println!("Crawl Result:\n{}", data),
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

    let llm_extraction_params = json!({
        "extractorOptions": {
            "extractionSchema": json_schema,
            "mode": "llm-extraction"
        },
        "pageOptions": {
            "onlyMainContent": true
        }
    });

    let llm_extraction_result = app
        .scrape_url("https://news.ycombinator.com", Some(llm_extraction_params))
        .await;
    match llm_extraction_result {
        Ok(data) => println!("LLM Extraction Result:\n{}", data["llm_extraction"]),
        Err(e) => eprintln!("LLM Extraction failed: {}", e),
    }
}
