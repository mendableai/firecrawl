use firecrawl::FirecrawlApp;
use std::error::Error;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // Get API URL from environment
    let api_url = std::env::var("FIRECRAWL_API_URL")
        .expect("Please set the FIRECRAWL_API_URL environment variable");

    // Create the FirecrawlApp instance
    let firecrawl = FirecrawlApp::new_selfhosted(api_url, None::<&str>)?;

    // Start a crawl job that will likely have some errors (invalid URL format)
    println!("Starting a crawl job...");
    let crawl_response = firecrawl
        .crawl_url_async("https://no-wer-agg.invalid", None)
        .await?;
    println!("Crawl job started with ID: {}", crawl_response.id);

    println!("Let it do it's thing...");
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

    // Check the crawl errors
    println!("Checking for crawl errors...");
    match firecrawl.check_crawl_errors(&crawl_response.id).await {
        Ok(error_response) => {
            println!("Crawl errors response:");
            println!("  Number of errors: {}", error_response.errors.len());

            if !error_response.errors.is_empty() {
                println!("\nDetailed errors:");
                for (i, error) in error_response.errors.iter().enumerate() {
                    println!("Error #{}", i + 1);
                    println!("  ID: {}", error.id);
                    if let Some(timestamp) = &error.timestamp {
                        println!("  Timestamp: {}", timestamp);
                    }
                    println!("  URL: {}", error.url);
                    println!("  Error: {}", error.error);
                }
            }

            println!(
                "\nRobots.txt blocked URLs: {}",
                error_response.robots_blocked.len()
            );
            for (i, url) in error_response.robots_blocked.iter().enumerate() {
                println!("  {}. {}", i + 1, url);
            }
        }
        Err(e) => {
            println!("Failed to check crawl errors: {}", e);
        }
    }
    let cancel = firecrawl.cancel_crawl(&crawl_response.id).await?;
    println!("Cancel: {}", cancel.status);

    Ok(())
}
