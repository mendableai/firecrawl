# FIRE-1 AI Agent Documentation

## Overview

FIRE-1 is the first AI Agent introduced in Firecrawl. It enhances the scraping capabilities by enabling intelligent navigation and interaction with web pages, such as handling pagination and controlling the browser. This allows for much more comprehensive data extraction compared to standard scraping methods.

The FIRE-1 agent can be used with both the `scrape` and `extract` endpoints.

## Enabling FIRE-1 Agent

To enable the FIRE-1 agent, you need to include the `agent` object within your API request payload for either the `scrape` or `extract` endpoint.

The `agent` object has the following properties:

*   `model` (string, optional): Specifies the AI model to use. If not provided, it defaults to `FIRE-1`. Currently, `FIRE-1` is the only available model.
*   `prompt` (string, required): Provides instructions for the AI agent, describing what content to look for and how to navigate the website (e.g., how to handle pagination, buttons to click, etc.).

### Using FIRE-1 with the Scrape Endpoint

You can use the FIRE-1 agent with the `/v1/scrape` endpoint to apply intelligent navigation before scraping the final content.

**Example (cURL):**

```bash
curl -X POST https://api.firecrawl.dev/v1/scrape \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer YOUR_API_KEY' \
    -d '{
      "url": "https://example.com/products?page=1",
      "formats": ["markdown"],
      "agent": {
        "prompt": "Navigate through the product listings by clicking the \'Next Page\' button until it is disabled. Scrape the content of each page visited."
      }
    }'
```

In this example, the FIRE-1 agent is instructed to paginate through product listings before the final scrape occurs.

### Using FIRE-1 with the Extract Endpoint

Similarly, you can leverage the FIRE-1 agent with the `/v1/extract` endpoint for complex extraction tasks that require navigation across multiple pages or interaction with elements.

**Example (cURL):**

```bash
curl -X POST https://api.firecrawl.dev/v1/extract \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer YOUR_API_KEY' \
    -d '{
      "urls": ["https://example-forum.com/topic/123"],
      "prompt": "Extract all user comments from this forum thread.",
      "schema": {
        "type": "object",
        "properties": {
          "comments": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "author": {"type": "string"},
                "comment_text": {"type": "string"}
              },
              "required": ["author", "comment_text"]
            }
          }
        },
        "required": ["comments"]
      },
      "agent": {
        "prompt": "Click the \'Load More Comments\' button until it disappears to ensure all comments are loaded before extraction."
      }
    }'
```

Here, the agent ensures all comments are loaded on the page by interacting with the "Load More Comments" button before the extraction process begins based on the provided schema and prompt.

**Note:** The FIRE-1 agent provides powerful capabilities but might consume more credits depending on the complexity of the navigation instructions and the number of pages interacted with.
