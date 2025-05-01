# Qwen3 Web Crawler Example

This example demonstrates how to use the Firecrawl API with the Qwen3 30B A3B model via OpenRouter to crawl websites and extract information based on specific objectives.

## Features

- Maps a website to find relevant pages based on an objective
- Uses the Qwen3 30B A3B model from OpenRouter for intelligent search parameter generation
- Scrapes and analyzes top pages to extract relevant information
- Returns structured JSON data when the objective is met

## Prerequisites

- Python 3.7+
- Firecrawl API key
- OpenRouter API key (or OpenAI API key configured for OpenRouter)

## Setup

1. Clone the repository
2. Install the required dependencies:
   ```
   pip install firecrawl openai python-dotenv
   ```
3. Create a `.env` file based on the `.env.example` template and add your API keys:
   ```
   FIRECRAWL_API_KEY=your_firecrawl_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   ```

## Usage

Run the script:

```
python qwen3_web_crawler.py
```

You will be prompted to:
1. Enter the website URL to crawl
2. Enter your objective (what information you're looking for)

The script will:
1. Analyze your objective to determine the optimal search parameter
2. Map the website to find relevant pages
3. Scrape and analyze the top pages
4. Extract and return the relevant information in JSON format if the objective is met

## Example

Input:
- Website: https://firecrawl.dev
- Objective: Find the pricing information for the API service

Output:
```json
{
  "basic_plan": "$49/month",
  "pro_plan": "$99/month",
  "enterprise_plan": "Custom pricing",
  "free_trial": "7 days"
}
```

## How It Works

1. The script uses the Firecrawl API to map and scrape websites
2. It leverages the Qwen3 30B A3B model via OpenRouter to:
   - Generate optimal search parameters based on the objective
   - Analyze scraped content to determine if the objective is met
   - Extract relevant information in a structured format

## License

This example is part of the Firecrawl project and is licensed under the same terms.
