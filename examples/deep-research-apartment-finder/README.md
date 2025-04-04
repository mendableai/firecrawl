# Apartment Finder CLI

A command-line tool that uses Firecrawl's Deep Research API and Anthropic's Claude 3.7 to find and analyze apartment listings based on your preferences.

## Features

- Interactive input for apartment search preferences
- Searches apartments by location, budget, bedrooms, and amenities
- Automatically researches apartment listings across multiple websites
- Uses AI to analyze and extract the top 3 options
- Provides detailed information including price, location, features, and pros/cons
- Option to save results as JSON

## Installation

1. Clone this repository:

   ```
   git clone <repository-url>
   cd apartment-finder
   ```

2. Install dependencies:

   ```
   pip install -r requirements.txt
   ```

3. Set up API keys:
   - Copy `.env.example` to `.env`
   - Fill in your Firecrawl API key from [firecrawl.dev](https://firecrawl.dev)
   - Fill in your Anthropic API key from [console.anthropic.com](https://console.anthropic.com)

## Usage

Run the script and follow the interactive prompts:

```bash
python apartment_finder.py
```

The script will prompt you for:

- Location (city or neighborhood)
- Budget (maximum monthly rent)
- Number of bedrooms
- Desired amenities

After searching and analyzing, the tool will display the top apartment options and offer to save the results to a JSON file.

## Notes

- The search process may take a few minutes due to the deep research API.
- Results will vary based on available apartment listings at the time of search.
- API usage may incur costs depending on your Firecrawl and Anthropic subscription plans.
