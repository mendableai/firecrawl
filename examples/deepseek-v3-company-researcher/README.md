# DeepSeek V3 Company Researcher

This tool is a powerful company research assistant that combines Google search, DeepSeek Chat V3, and Firecrawl to gather and analyze company information automatically.

## Features

- Automated Google search using SerpAPI
- Intelligent URL selection using DeepSeek Chat V3
- Structured data extraction using Firecrawl
- Real-time progress monitoring and colorized output
- Automated handling of rate limits and polling

## Prerequisites

- Python 3.7+
- API keys for:
  - OpenRouter (for DeepSeek Chat V3 access)
  - Firecrawl
  - SerpAPI

## Setup

1. Clone the repository
2. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Create a `.env` file in the project root with your API keys:
   ```
   OPENROUTER_API_KEY=your_openrouter_api_key
   FIRECRAWL_API_KEY=your_firecrawl_api_key
   SERP_API_KEY=your_serpapi_key
   ```

## Usage

Run the script:

```bash
python deepseek-v3-extract.py
```

Follow the interactive prompts to:

1. Enter the company name you want to research
2. Specify what information you want to gather about the company

The tool will:

- Search for relevant company information
- Select the most promising URLs
- Extract structured data from those URLs
- Present the findings in a clear, formatted output

## Output

The script provides real-time feedback with color-coded status messages:

- 🔵 Blue: User prompts
- 🟡 Yellow: Processing status
- 🟢 Green: Success messages
- 🔴 Red: Error messages
- 🟣 Magenta: Special notifications
- 🔅 Cyan: URL selections

## Error Handling

The script includes comprehensive error handling for:

- API failures
- Network issues
- Invalid responses
- Timeout scenarios

## License

MIT License

## Contributing

Feel free to open issues or submit pull requests with improvements.
