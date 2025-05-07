# Firecrawl MCP Implementation

This is an improved Model Context Protocol (MCP) implementation for Firecrawl that helps agents use the right endpoints for different scenarios.

## Common Misuse Cases

1. **Using crawl for single page information retrieval**
   - **Problem**: Agents use crawl when they only need content from a single page, which is inefficient and can cause token overflow.
   - **Solution**: Use scrape instead of crawl when you only need content from a single specific URL.

2. **Token overflow from large crawl responses**
   - **Problem**: Crawl responses can be very large and exceed token limits, causing the agent to fail.
   - **Solution**: Limit the crawl depth and number of pages, or use map + scrape for better control.

3. **Not using map for URL discovery**
   - **Problem**: Agents try to guess URLs or use crawl to discover URLs, which is inefficient.
   - **Solution**: Use map to discover URLs before deciding what to scrape, especially for large websites.

4. **Inefficient information search**
   - **Problem**: Agents crawl entire websites when looking for specific information.
   - **Solution**: Use search when looking for specific information rather than crawling entire websites.

5. **Not using extract for structured data**
   - **Problem**: Agents try to parse structured data from scraped content, which is error-prone.
   - **Solution**: Use extract for structured data, which uses AI to extract specific information.

## Endpoint Usage Examples

### Scrape
```json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com/about"
  }
}
```
**Best for**: Single page content extraction, when you know exactly which page contains the information.

### Map
```json
{
  "name": "firecrawl_map",
  "arguments": {
    "url": "https://example.com"
  }
}
```
**Best for**: Discovering URLs before deciding what to scrape, finding specific sections of a website.

### Crawl
```json
{
  "name": "firecrawl_crawl",
  "arguments": {
    "url": "https://example.com/blog",
    "limit": 5,
    "maxDepth": 2
  }
}
```
**Best for**: Extracting content from multiple related pages, when you need comprehensive coverage.
**Warning**: Responses can be very large and may exceed token limits.

### Search
```json
{
  "name": "firecrawl_search",
  "arguments": {
    "query": "latest AI research papers 2023",
    "limit": 5
  }
}
```
**Best for**: Finding specific information across multiple websites, when you don't know which website has the information.

### Extract
```json
{
  "name": "firecrawl_extract",
  "arguments": {
    "urls": ["https://example.com/product"],
    "prompt": "Extract product information",
    "schema": {
      "name": "string",
      "price": "number",
      "description": "string"
    }
  }
}
```
**Best for**: Extracting specific structured data like prices, names, details.

### Deep Research
```json
{
  "name": "firecrawl_deep_research",
  "arguments": {
    "query": "What are the environmental impacts of electric vehicles compared to gasoline vehicles?",
    "maxDepth": 5,
    "maxUrls": 10
  }
}
```
**Best for**: Complex research questions requiring multiple sources, in-depth analysis.

### Generate LLMs.txt
```json
{
  "name": "firecrawl_generate_llmstxt",
  "arguments": {
    "url": "https://example.com"
  }
}
```
**Best for**: Creating machine-readable permission guidelines for AI models.

## Improvements in this Implementation

1. **Enhanced Tool Descriptions**: Clear guidance on when to use each endpoint, with examples and recommendations.
2. **Parameter Validation**: Prevents common misuses like setting too high limits for crawl.
3. **Token Overflow Prevention**: Warnings and limits to prevent token overflow issues.
4. **Misuse Detection**: Identifies common misuse patterns and provides recommendations.
5. **Improved Error Handling**: Better error messages and retry logic for API calls.
