# Llama 4 Maverick Web Crawler

This project combines the power of Firecrawl for web crawling and Llama 4 Maverick (via Together AI) for intelligent content analysis. It helps you find specific information on websites by crawling pages and analyzing their content using advanced language models.

## Features

- Intelligent URL mapping and relevance ranking
- Content analysis using Llama 4 Maverick model
- Automatic extraction of relevant information
- Color-coded console output for better readability

## Prerequisites

- Python 3.8 or higher
- Firecrawl API key
- Together AI API key

## Installation

1. Clone this repository
2. Install the required packages:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Add your API keys to the `.env` file:
   ```
   FIRECRAWL_API_KEY=your_firecrawl_api_key_here
   TOGETHER_API_KEY=your_together_api_key_here
   ```

## Usage

Run the script using:

```bash
python llama4-maverick-web-crawler.py
```

You will be prompted to:

1. Enter the website URL to crawl
2. Specify your objective/what information you're looking for

The script will then:

1. Map the website and find relevant pages
2. Analyze the content using Llama 4 Maverick
3. Extract and return the requested information in JSON format

## Example

```bash
Enter the website to crawl: https://example.com
Enter your objective: Find the company's contact information
```

## Error Handling

The script includes comprehensive error handling and will provide clear feedback if:

- API keys are missing
- Website is inaccessible
- No relevant information is found
- Any other errors occur during execution

## Dependencies

- firecrawl: For web crawling and content extraction
- together: For accessing the Llama 4 Maverick model
- python-dotenv: For environment variable management

## License

[Your chosen license]
