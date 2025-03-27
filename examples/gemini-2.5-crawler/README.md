# Gemini 2.5 Web Crawler

A powerful web crawler that uses Google's Gemini 2.5 Pro model to intelligently analyze web content, PDFs, and images based on user-defined objectives.

## Features

- Intelligent URL mapping and ranking based on relevance to search objective
- PDF content extraction and analysis
- Image content analysis and description
- Smart content filtering based on user objectives
- Support for multiple content types (markdown, PDFs, images)
- Color-coded console output for better readability

## Prerequisites

- Python 3.8+
- Google Cloud API key with Gemini API access
- Firecrawl API key

## Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd <your-repo-directory>
```

2. Install the required dependencies:

```bash
pip install -r requirements.txt
```

3. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

4. Add your API keys to the `.env` file:

```
FIRECRAWL_API_KEY=your_firecrawl_api_key
GEMINI_API_KEY=your_gemini_api_key
```

## Usage

Run the script:

```bash
python gemini-2.5-crawler.py
```

The script will prompt you for:

1. The website URL to crawl
2. Your search objective

The crawler will then:

1. Map the website and find relevant pages
2. Analyze the content using Gemini 2.5 Pro
3. Extract and analyze any PDFs or images found
4. Return structured information related to your objective

## Output

The script provides color-coded console output for:

- Process steps and progress
- Debug information
- Success and error messages
- Final results in JSON format

## Error Handling

The script includes comprehensive error handling for:

- API failures
- Content extraction issues
- Invalid URLs
- Timeouts
- JSON parsing errors

## Note

This script uses the experimental Gemini 2.5 Pro model (`gemini-2.5-pro-exp-03-25`). Make sure you have appropriate access and quota for using this model.
