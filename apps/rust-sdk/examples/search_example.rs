use clap::{Parser, ValueEnum};
use firecrawl::{
    search::{SearchParams, SearchResponse},
    FirecrawlApp,
};
use std::error::Error;

#[derive(Debug, Parser)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Which example to run
    #[arg(value_enum, default_value_t = Examples::All)]
    example: Examples,
}

#[derive(Debug, Clone, ValueEnum)]
enum Examples {
    All,
    Basic,
    Advanced,
    Geo,
    Temporal,
    Social,
    News,
    Academic,
    Commercial,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let args = Args::parse();

    let api_url = std::env::var("FIRECRAWL_API_URL")
        .expect("Please set the FIRECRAWL_API_URL environment variable");
    let firecrawl = FirecrawlApp::new_selfhosted(api_url, None::<&str>)?;

    match args.example {
        Examples::All => {
            run_basic_example(&firecrawl).await?;
            run_advanced_example(&firecrawl).await?;
            run_geographic_example(&firecrawl).await?;
            run_temporal_example(&firecrawl).await?;
            run_social_example(&firecrawl).await?;
            run_news_example(&firecrawl).await?;
            run_academic_example(&firecrawl).await?;
            run_commercial_example(&firecrawl).await?;
        }
        Examples::Basic => run_basic_example(&firecrawl).await?,
        Examples::Advanced => run_advanced_example(&firecrawl).await?,
        Examples::Geo => run_geographic_example(&firecrawl).await?,
        Examples::Temporal => run_temporal_example(&firecrawl).await?,
        Examples::Social => run_social_example(&firecrawl).await?,
        Examples::News => run_news_example(&firecrawl).await?,
        Examples::Academic => run_academic_example(&firecrawl).await?,
        Examples::Commercial => run_commercial_example(&firecrawl).await?,
    }

    Ok(())
}
async fn run_basic_example(firecrawl: &FirecrawlApp) -> Result<(), Box<dyn Error>> {
    let query = "rust programming language";
    let results = firecrawl.search(query, None).await?;
    print_results("Basic Search", query, &results);
    Ok(())
}

async fn run_advanced_example(firecrawl: &FirecrawlApp) -> Result<(), Box<dyn Error>> {
    let query = "rust web framework site:github.com OR site:gitlab.com";
    let params = SearchParams {
        query: query.to_string(),
        limit: Some(5),
        ..Default::default()
    };
    let results = firecrawl.search_with_params(params).await?;
    print_results("Advanced Repository Search", query, &results);
    Ok(())
}

async fn run_geographic_example(firecrawl: &FirecrawlApp) -> Result<(), Box<dyn Error>> {
    let query = "coworking space startup hub";
    let params = SearchParams {
        query: query.to_string(),
        // WARN: Doesn't work with  searxng
        location: Some("Silicon Valley, CA".to_string()),
        // WARN: Doesn't work with  searxng
        country: Some("us".to_string()),
        limit: Some(5),
        ..Default::default()
    };
    let results = firecrawl.search_with_params(params).await?;
    print_results("Geographic-Specific Search", query, &results);
    Ok(())
}

async fn run_temporal_example(firecrawl: &FirecrawlApp) -> Result<(), Box<dyn Error>> {
    let query = "artificial intelligence breakthroughs";
    let params = SearchParams {
        query: query.to_string(),
        // WARN: Doesn't work with  searxng
        tbs: Some("qdr:m1".to_string()),
        limit: Some(5),
        ..Default::default()
    };
    let results = firecrawl.search_with_params(params).await?;
    print_results("Recent AI News", query, &results);
    Ok(())
}

async fn run_social_example(firecrawl: &FirecrawlApp) -> Result<(), Box<dyn Error>> {
    let query = "viral tech trends site:twitter.com";
    let params = SearchParams {
        query: query.to_string(),
        // WARN: Doesn't work. Maybe searxng related
        filter: Some("site:twitter.com OR site:linkedin.com".to_string()),
        // WARN: Doesn't work with  searxng
        tbs: Some("qdr:w".to_string()), // Last week
        limit: Some(5),
        ..Default::default()
    };
    let results = firecrawl.search_with_params(params).await?;
    print_results("Social Media Tech Trends", query, &results);
    Ok(())
}

async fn run_news_example(firecrawl: &FirecrawlApp) -> Result<(), Box<dyn Error>> {
    let query =
        "cryptocurrency market analysis site:reuters.com OR site:bloomberg.com OR site:ft.com";
    let params = SearchParams {
        query: query.to_string(),
        // WARN: Doesn't work with searxng
        tbs: Some("qdr:d".to_string()), // Last 24 hours
        limit: Some(5),
        ..Default::default()
    };
    let results = firecrawl.search_with_params(params).await?;
    print_results("Financial News Search", query, &results);
    Ok(())
}

async fn run_academic_example(firecrawl: &FirecrawlApp) -> Result<(), Box<dyn Error>> {
    let query = "quantum computing research papers site:arxiv.org OR site:scholar.google.com";
    let params = SearchParams {
        query: query.to_string(),
        // WARN: Doesn't work. Maybe searxng related
        // filter: Some("site:arxiv.org OR site:scholar.google.com".to_string()),
        // WARN: Doesn't work with  searxng
        tbs: Some("qdr:y".to_string()), // Last year
        limit: Some(5),
        ..Default::default()
    };
    let results = firecrawl.search_with_params(params).await?;
    print_results("Academic Research Search", query, &results);
    Ok(())
}

async fn run_commercial_example(firecrawl: &FirecrawlApp) -> Result<(), Box<dyn Error>> {
    let query = "enterprise cloud solutions reviews site:g2.com";
    let params = SearchParams {
        query: query.to_string(),
        limit: Some(5),
        ..Default::default()
    };
    let results = firecrawl.search_with_params(params).await?;
    print_results("Commercial Product Search", query, &results);
    Ok(())
}

fn print_results(name: &str, query: &str, results: &SearchResponse) {
    let sec = "=".repeat(70);

    println!("\n{sec}");
    println!("🔍 {name}");
    println!("🔎 Query: \"{query}\"");
    println!("{sec}");

    for (i, doc) in results.data.iter().enumerate() {
        println!("{}. 📌 Title: {}", i + 1, doc.title);
        println!("  - 🔗 URL: {}", doc.url);
        println!("  - 📝 Description: \"{:.40}\"...", doc.description);
    }

    if let Some(warning) = &results.warning {
        println!("\n⚠️  Warning: {warning}");
    }
    println!("{sec}\n");
}
