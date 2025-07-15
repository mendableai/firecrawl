#![allow(clippy::option_map_unit_fn)]
use bat::{Input, PrettyPrinter};
use firecrawl::{llmstxt::GenerateLLMsTextParams, FirecrawlApp};
use std::error::Error;

use clap::{Parser, ValueEnum};

#[derive(Copy, Clone, PartialEq, Eq, ValueEnum)]
enum Mode {
    Basic,
    Pool,
    Fulltext,
}

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// URL for which to generate LLMs.txt
    #[arg(default_value = "https://www.firecrawl.dev/")]
    url: String,

    #[arg(long, short = 'm', value_enum, default_value = "Mode::Basic")]
    mode: Mode,

    /// Maximum number of URLs to process
    #[arg(long, short = 'd', default_value = "1")]
    max_urls: u32,

    /// Whether to show the full LLMs-full.txt in the response
    #[arg(long, short = 'f', default_value = "false")]
    full_text: bool,

    /// Experimental streaming option
    #[arg(long, short = 's', default_value = "false")]
    stream: bool,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let args = Args::parse();

    let api_url = std::env::var("FIRECRAWL_API_URL")
        .expect("Please set the FIRECRAWL_API_URL environment variable");
    let firecrawl = FirecrawlApp::new_selfhosted(api_url, None::<&str>)?;

    let params = GenerateLLMsTextParams {
        url: args.url.clone(),
        max_urls: args.max_urls,
        show_full_text: args.full_text,
        experimental_stream: args.stream,
    };

    match args.mode {
        Mode::Basic => {
            println!("Example 1: Basic LLMs.txt generation (synchronous)");
            println!("Generating LLMs.txt for {}...", args.url);
            firecrawl
                .generate_llms_text(params)
                .await
                .inspect(|result| {
                    println!("Expires at: {}", result.expires_at);
                    let text = (if args.full_text {
                        result.data.full.as_ref()
                    } else {
                        result.data.compact.as_ref()
                    })
                    .expect("LLM Text");

                    pretty_print_content("Firecrawl Result", text).expect("Print");
                })?;
        }
        Mode::Pool => {
            println!("Example 2: Asynchronous LLMs.txt generation with manual polling");

            println!("Starting asynchronous LLMs.txt generation job...");
            let response = firecrawl.async_generate_llms_text(params).await?;

            println!("LLMs.txt generation job initiated:");
            println!("  Job ID: {}", response.id);
            println!("\nManually polling for status...");
            for _ in 0..10 {
                let status = firecrawl
                    .check_generate_llms_text_status(&response.id)
                    .await?;

                match status.status.as_str() {
                    "completed" => {
                        println!("LLMs.txt generation completed!");
                        let text = (if args.full_text {
                            status.data.full.as_ref()
                        } else {
                            status.data.compact.as_ref()
                        })
                        .expect("LLM Text");

                        pretty_print_content("Pool Result", text).expect("Print");

                        break;
                    }
                    "failed" => {
                        println!(
                            "LLMs.txt generation failed: {}",
                            status.error.unwrap_or_default()
                        );
                        break;
                    }
                    status => println!("Generation status: {}", status),
                }

                println!("Waiting 2 seconds before checking again...");
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }
        }
        Mode::Fulltext => {
            println!("Example 3: LLMs.txt generation with full text");

            println!("Generating LLMs.txt with full text...");
            match firecrawl.generate_llms_text(params).await {
                Ok(result) => {
                    println!("LLMs.txt generation completed successfully!");
                    let llmstxt = result.data.compact.expect("LLMs Text Expected");
                    let fulltxt = result.data.full.expect("Full LLMs Text Expected");

                    pretty_print_contents(&[
                        ("LLMs.txt (compact)", llmstxt),
                        ("LLMs.txt (full text)", fulltxt),
                    ])
                    .expect("Print")
                }
                Err(e) => {
                    println!("LLMs.txt generation failed: {}", e);
                }
            }
        }
    }

    Ok(())
}

/// Pretty prints the provided content with syntax highlighting
fn pretty_print_content(title: &str, content: &str) -> Result<(), Box<dyn Error>> {
    PrettyPrinter::new()
        .header(true)
        .grid(true)
        .input(
            Input::from_bytes(content.as_bytes())
                .title(title)
                .name("file.md"),
        )
        .print()?;

    Ok(())
}

/// Pretty prints multiple contents with syntax highlighting
fn pretty_print_contents(title_contents: &[(&'static str, String)]) -> Result<(), Box<dyn Error>> {
    let mut inputs = Vec::new();
    for (title, content) in title_contents {
        inputs.push(
            Input::from_bytes(content.as_bytes())
                .title(*title)
                .name("file.md"),
        );
    }

    PrettyPrinter::new()
        .header(true)
        .grid(true)
        .inputs(inputs)
        .print()?;

    Ok(())
}
