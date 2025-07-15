# Web Information Extractor with Llama 4 Maverick

This tool uses Llama 4 Maverick (via Together AI), SerpAPI, and Firecrawl to automatically extract structured information about companies from the web. It performs intelligent URL selection and information extraction from web content.

## Features

- Automated Google search using SerpAPI
- Intelligent URL selection using Llama 4 Maverick
- Structured data extraction using Firecrawl
- Color-coded console output for better readability

## Prerequisites

- Python 3.8+
- Together AI API key
- SerpAPI API key
- Firecrawl API key

## Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd <your-repo-name>
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy the example environment file and fill in your API keys:

```bash
cp .env.example .env
```

4. Edit the `.env` file with your API keys:

```
TOGETHER_API_KEY=your_together_ai_key
SERP_API_KEY=your_serpapi_key
FIRECRAWL_API_KEY=your_firecrawl_key
```

## Usage

Run the script:

```bash
python llama-4-maverick-extractor.py
```

The script will:

1. Prompt you for a company name
2. Ask what information you want to extract
3. Search for relevant URLs
4. Extract and structure the requested information
5. Display the results

## Example

```bash
$ python llama-4-maverick-extractor.py
Enter the company name: Tesla
Enter what information you want about the company: latest electric vehicle models and their prices
```

## Error Handling

The script includes comprehensive error handling for:

- Missing API keys
- API rate limits
- Network issues
- Invalid responses
- JSON parsing errors

## License

MIT License - feel free to use and modify as needed.
