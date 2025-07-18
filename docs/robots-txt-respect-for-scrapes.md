# Robots.txt Respect for Scrapes

## Overview

Firecrawl now supports respecting `robots.txt` rules for scrape operations as an opt-in feature. This allows teams to ensure their scraping activities comply with website owners' crawling preferences as specified in their `robots.txt` files.

## How It Works

- **Opt-in by default**: Unlike crawls (which respect robots.txt by default), scrapes will NOT respect robots.txt unless explicitly enabled
- **Team-level flag**: The feature is controlled by the `respectRobotsOnScrapes` team flag
- **User agent**: Firecrawl identifies itself as `FireCrawlAgent` or `FirecrawlAgent` when checking robots.txt rules

## Enabling the Feature

To enable robots.txt respect for scrapes, the `respectRobotsOnScrapes` flag must be set to `true` for your team. This can be done:

1. **Via Database** (for administrators):
   ```sql
   UPDATE teams
   SET flags = jsonb_set(
     COALESCE(flags, '{}'::jsonb),
     '{respectRobotsOnScrapes}',
     'true'::jsonb
   )
   WHERE id = 'YOUR_TEAM_ID';
   ```

2. **Contact Support**: Reach out to support@firecrawl.com to have this flag enabled for your team

## Behavior When Enabled

When `respectRobotsOnScrapes` is enabled:

1. Before scraping any URL, Firecrawl will fetch and parse the website's `robots.txt` file
2. If the URL is disallowed for the `FireCrawlAgent` user agent, the scrape will fail with error: "URL blocked by robots.txt"
3. If robots.txt cannot be fetched (e.g., 404 error), the scrape will proceed normally

## Example

With `respectRobotsOnScrapes` enabled, attempting to scrape a URL that's blocked in robots.txt:

```javascript
// Request
POST /api/v1/scrape
{
  "url": "https://example.com/admin",
  "formats": ["markdown"]
}

// Response (if blocked by robots.txt)
{
  "success": false,
  "error": "URL blocked by robots.txt"
}
```

## Notes

- This feature only affects the `/api/v1/scrape` endpoint
- Crawl operations (`/api/v1/crawl`) already respect robots.txt by default (can be disabled with `ignoreRobots` flag)
- The `skipTlsVerification` option in scrape requests also applies to fetching robots.txt