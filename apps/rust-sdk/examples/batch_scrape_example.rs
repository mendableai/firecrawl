use clap::{Parser, Subcommand};
use firecrawl::{
    batch_scrape::{BatchScrapeParams, WebhookOptions},
    map::MapOptions,
    scrape::{ScrapeFormats, ScrapeOptions},
    FirecrawlApp,
};
use serde_json::Value;
use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::Mutex;

// Store webhook responses
struct WebhookState {
    responses: Vec<Value>,
}

#[derive(Parser)]
#[command(version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Multiple URL scraping with webhook monitoring
    Basic,
}

async fn create_firecrawl_app() -> Result<FirecrawlApp, Box<dyn Error>> {
    let api_url = std::env::var("FIRECRAWL_API_URL")
        .expect("Please set the FIRECRAWL_API_URL environment variable");
    FirecrawlApp::new_selfhosted(api_url, None::<&str>).map_err(|e| e.into())
}

// Start webhook server and return its address
async fn start_webhook_server(
    port: u16,
    state: Arc<Mutex<WebhookState>>,
) -> Result<String, Box<dyn Error>> {
    let state = state.clone();
    use axum::routing::post;
    use axum::Json;

    let app = axum::Router::new().route(
        "/",
        post(move |body: Json<Value>| {
            let state = state.clone();
            async move {
                state.lock().await.responses.push(body.0.clone());
                match serde_json::to_string_pretty(&body.0) {
                    Ok(data) => println!(
                        "Received webhook: {}",
                        serde_json::to_string_pretty(&data).unwrap()
                    ),
                    Err(_) => println!("Received webhook: {}", body.0),
                }
                "OK"
            }
        }),
    );

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let webhook_url = format!("http://host.docker.internal:{}", port);

    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .inspect_err(|err| println!("{err:?}"))
            .unwrap();

        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("Webhook server error: {}", e);
        }
    });

    println!("Webhook server running at {}", webhook_url);

    Ok(webhook_url)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let cli = Cli::parse();
    let firecrawl = create_firecrawl_app().await?;

    let state = Arc::new(Mutex::new(WebhookState { responses: vec![] }));
    let webhook_url = start_webhook_server(39120, state.clone()).await?;

    match cli.command {
        Commands::Basic => {
            let mut urls = Vec::new();

            let url_one = "https://invalid-url.url/";
            println!("Mapping: {}", url_one);
            match firecrawl.map_url(url_one, None).await {
                Ok(mapped_urls) => urls.extend(mapped_urls),
                Err(e) => println!("Error mapping {}: {}", url_one, e),
            }

            let url_two = "https://www.devjobsscanner.com";
            println!("Mapping: {}", url_two);
            match firecrawl
                .map_url(
                    url_two,
                    Some(MapOptions {
                        search: Some("rust".into()),
                        limit: Some(20),
                        ..Default::default()
                    }),
                )
                .await
            {
                Ok(mapped_urls) => urls.extend(mapped_urls),
                Err(e) => println!("Error mapping {}: {}", url_two, e),
            }

            test_multiple_urls(&firecrawl, urls, &webhook_url).await?;

            // Give time for webhooks to arrive
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
            println!(
                "Received {} webhook responses",
                state.lock().await.responses.len()
            );
        }
    }

    Ok(())
}

async fn test_multiple_urls(
    app: &FirecrawlApp,
    urls: Vec<String>,
    webhook_url: &str,
) -> Result<(), Box<dyn Error>> {
    println!("Testing batch scraping of {} URLs", urls.len());

    let webhook = WebhookOptions {
        url: webhook_url.to_string(),
        headers: None,
        auth_token: None,
    };

    let params = BatchScrapeParams {
        urls,
        webhook: Some(webhook),
        ignore_invalid_urls: true,
        options: Some(ScrapeOptions {
            formats: Some(vec![ScrapeFormats::Markdown, ScrapeFormats::Links]),
            ..Default::default()
        }),
        ..Default::default()
    };

    let batch = app.async_batch_scrape_urls(params).await?;
    println!("Batch job started: {}", batch.id);

    // Poll status periodically
    loop {
        let status = app.check_batch_scrape_status(&batch.id).await?;
        println!("Progress: {}/{} pages", status.completed, status.total);

        if status.completed >= status.total {
            println!("Batch job completed!");
            break;
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }

    Ok(())
}
