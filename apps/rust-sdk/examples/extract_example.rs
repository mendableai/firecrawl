use firecrawl::{extract::ExtractParams, FirecrawlApp};
use serde_json::json;
use std::error::Error;

use clap::{Parser, ValueEnum};

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(value_enum)]
    command: Examples,
}

#[derive(Copy, Clone, PartialEq, Eq, ValueEnum)]
enum Examples {
    Basic,
    Schema,
    JsonSchema,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let args = Args::parse();

    let api_url = std::env::var("FIRECRAWL_API_URL")
        .expect("Please set the FIRECRAWL_API_URL environment variable");
    let firecrawl = FirecrawlApp::new_selfhosted(api_url, None::<&str>)?;
    let urls = vec![
        "https://www.firecrawl.dev/".to_string(),
        "https://betteruptime.com".to_string(),
    ];

    match args.command {
        Examples::Basic => {
            println!("Example 1: Extracting with URLs and prompt");

            let extract_params = ExtractParams {
                prompt: Some(
                    "Extract Product promise, consice descirption and category".to_string(),
                ),
                url_trace: Some(true),
                ..Default::default()
            };

            println!("Starting asynchronous extraction job...");
            let response = firecrawl
                .async_extract(ExtractParams {
                    urls: Some(urls.iter().map(|u| u.to_string()).collect()),
                    prompt: extract_params.prompt.clone(),
                    url_trace: extract_params.url_trace,
                    ..Default::default()
                })
                .await?;

            println!("Extract job initiated:");
            println!("  Job ID: {}", response.id);

            println!("\nChecking extract status...");
            for _ in 0..5 {
                let response = firecrawl.get_extract_status(&response.id).await?;

                println!("Extract status: {}", response.status);
                if let Some(url_trace) = &response.url_trace {
                    println!("URL traces:");
                    for trace in url_trace {
                        println!("  URL: {}", trace.url);
                        println!("  Status: {}", trace.status);
                    }
                }
                println!("Extract data: {:#?}", response.data);
                if response.status == "completed" {
                    break;
                }

                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }
        }
        Examples::Schema => {
            println!("Example 2: Extracting with schema");

            let schema = json!({
                "type": "object",
                "properties": {
                    "category": { "type": "string" },
                    "promise": { "type": "string" },
                    "descirption": { "type": "string" }
                },
                "required": ["category", "promise", "description"]
            });

            println!("Starting synchronous extraction job...");

            match firecrawl
                .extract(ExtractParams {
                    urls: urls.into(),
                    schema: Some(schema),
                    ..Default::default()
                })
                .await
            {
                Ok(result) => {
                    println!("Extraction completed successfully!");
                    println!("Status: {}", result.status);

                    if let Some(data) = result.data {
                        println!("\nExtracted data:");
                        println!("  Title: {}", data["title"]);
                        if let Some(desc) = data.get("description") {
                            println!("  Description: {}", desc);
                        }
                        println!(
                            "  Content (preview): {:.100}...",
                            data["content"].as_str().unwrap_or("N/A")
                        );
                    }

                    if let Some(sources) = result.sources {
                        println!("\nSources:");
                        for (field, urls) in sources {
                            println!("  {}: {}", field, urls.join(", "));
                        }
                    }
                }
                Err(e) => {
                    println!("Extraction failed: {}", e);
                }
            }
        }
        Examples::JsonSchema => {
            println!("Example 3: Using JsonSchema derive");

            /// A comprehensive analysis of given product
            #[derive(serde::Serialize, serde::Deserialize, schemars::JsonSchema)]
            struct ProductAnalysis {
                /// The full name of the product
                product_name: String,
                /// The company/brand behind the product
                brand: String,
                /// The general price range (e.g. "Premium", "$10-50", "Enterprise")
                price_range: String,
                /// The main customer segments this product targets
                target_audience: Vec<String>,
                /// Primary benefits and value propositions of the product
                key_benefits: Vec<String>,
                /// Distinctive features that set this product apart from competitors
                unique_selling_points: Vec<String>,
                /// Direct comparisons with competing products/services
                competitor_comparison: Vec<String>,
                /// Technologies, frameworks, or platforms used (if applicable)
                tech_stack: Option<Vec<String>>,
                /// Aggregated review data and sentiment analysis
                reviews_summary: ReviewsSummary,
                // /// Score from 0-10 indicating product-market fit based on analysis
                // market_fit_score: f32, // NOTE: Breaks
                /// Assessment of future growth prospects (e.g. "High", "Moderate", "Limited")
                growth_potential: String,
                /// Relevant compliance standards and certifications
                regulatory_compliance: Option<Vec<String>>,
            }

            /// Aggregated analysis of product reviews from multiple sources
            #[derive(serde::Serialize, serde::Deserialize, schemars::JsonSchema)]
            struct ReviewsSummary {
                /// Overall sentiment from review analysis (e.g. "Highly Positive", "Mixed", "Negative")
                sentiment_analysis: String,
                /// Most frequently mentioned positive aspects
                common_praises: Vec<String>,
                /// Most frequently mentioned criticisms or issues
                common_complaints: Vec<String>,
                /// Platforms or websites where reviews were sourced from
                review_sources: Vec<String>,
            }
            println!("Starting extraction with derived schema...");
            match firecrawl
                .extract_with_schemars::<ProductAnalysis>(ExtractParams {
                    urls: urls.into(),
                    ..Default::default()
                })
                .await
            {
                Ok(result) => {
                    println!("Extraction completed!");
                    println!("Status: {}", result.status);

                    if let Some(data) = result.data {
                        if let Ok(analysis) = serde_json::from_value::<ProductAnalysis>(data) {
                            println!("\nExtracted Product Analysis:");
                            println!("  Product: {}", analysis.product_name);
                            println!("  Brand: {}", analysis.brand);
                            println!("  Price Range: {}", analysis.price_range);
                            println!("  Target Audience:");
                            for audience in analysis.target_audience {
                                println!("    - {}", audience);
                            }
                            println!("  Key Benefits:");
                            for benefit in analysis.key_benefits {
                                println!("    - {}", benefit);
                            }
                            println!("  USPs:");
                            for usp in analysis.unique_selling_points {
                                println!("    - {}", usp);
                            }

                            println!("\n  Reviews Summary:");
                            println!(
                                "    Sentiment: {}",
                                analysis.reviews_summary.sentiment_analysis
                            );
                            println!("    Common Praises:");
                            for praise in analysis.reviews_summary.common_praises {
                                println!("      - {}", praise);
                            }
                            println!("    Common Complaints:");
                            for complaint in analysis.reviews_summary.common_complaints {
                                println!("      - {}", complaint);
                            }
                        } else {
                            println!("Failed to parse extracted data");
                        }
                    }

                    if let Some(sources) = result.sources {
                        println!("\nSources:");
                        for (field, urls) in sources {
                            println!("  {}: {}", field, urls.join(", "));
                        }
                    }
                }
                Err(e) => {
                    println!("Extraction failed: {}", e);
                }
            }
        }
    }

    Ok(())
}
