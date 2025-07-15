# O3 Web Crawler

A Python tool that uses OpenAI's o3 model and Firecrawl to intelligently crawl websites based on specific objectives.

## Features

- Maps website URLs to identify the most relevant pages for your objective
- Uses OpenAI's o3 model to analyze and rank pages by relevance
- Extracts specific information from web pages based on your objective
- Provides detailed, color-coded terminal output to track progress

## Prerequisites

- Python 3.6+
- Firecrawl API key
- OpenAI API key

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
3. Create a `.env` file based on `.env.example` with your API keys

## Usage

Run the script:

```
python o3-web-crawler.py
```

You will be prompted to:

1. Enter a website URL to crawl
2. Specify your objective (what information you want to extract)

The script will:

- Analyze your objective to determine optimal search parameters
- Map the website to find relevant pages
- Rank pages by relevance to your objective
- Scrape and analyze top pages to extract the requested information
- Display results in JSON format

## Example

```
Enter the website to crawl: https://example.com
Enter your objective: Find the company's contact information and headquarters location
```

The script will intelligently crawl the website and extract the requested information.

## License

MIT
