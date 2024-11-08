# ➖ Firecrawl Simple

Crawl and convert any website into LLM-ready markdown.

## ![](https://trieve.b-cdn.net/firecrawl-simple/loc_chart.png)

<div>
  <p align="center"><a href="https://github.com/mendableai/firecrawl/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mendableai/firecrawl" alt="License"></a>
    <a href="https://x.com/trieveai"><img src="https://img.shields.io/badge/Follow%20on%20X-000000?style=flat&amp;logo=x&amp;logoColor=white" alt="Follow on X"></a>
    <a href="https://www.linkedin.com/company/90198314"><img src="https://img.shields.io/badge/Follow%20on%20LinkedIn-0077B5?style=flat&amp;logo=linkedin&amp;logoColor=white" alt="Follow on LinkedIn"></a>
    <a href="https://discord.gg/CuJVfgZf54"><img src="https://img.shields.io/discord/1130153053056684123.svg?style=flat&amp;logo=discord&amp;logoColor=white" alt="Join our Discord"></a></p>
</div>

## What is Firecrawl Simple?

Firecrawl Simple is a stripped down and stable version of firecrawl optimized for self-hosting and ease of contribution. Billing logic and AI features are completely removed.

`playwright` is replaced with [hero](https://github.com/ulixee/hero)s such that `fire-engine` and `scrapingbee` are not required for guarded pages.

Only the v1 `/scrape`, `/crawl/{id}`, and `/crawl` routes are supprted in firecrawl simple, see the [openapi spec here](/apps/api/v1-openapi.json). Also, `creditsUsed` has been removed from the API response on the `/crawl/{id}` route.

Posthog, supabase, stripe, langchain, logsnag, sentry, bullboard, and [several other deps from the package.json](https://github.com/mendableai/firecrawl/compare/main...devflowinc:firecrawl-simple:main#diff-2c40985d6d91eed8ae85ec1c8e754a85984ee32e156a600d2b7a467423d7e338) are removed.

## Contributing

This is a lot to maintain by ourselves and we are actively looking for others who would like to help. **There are paid part-time maintainer positions available.** We currently have bounties on a couple of issues, but would like someone interested in being an active maintainer longer-term.

## Why maintain a fork?

The [upstream firecrawl repo](https://github.com/mendableai/firecrawl) contains the following blurb:

> This repository is in development, and we're still integrating custom modules into the mono repo. It's not fully ready for self-hosted deployment yet, but you can run it locally.

Firecrawl's API surface and general functionality were ideal for our [Trieve sitesearch product](https://trieve.ai/sitesearch), but we needed a version ready for self-hosting that was easy to contribute to and scale on Kubernetes. Therefore, we decided to fork and begin maintaining a stripped down, stable version.

Fire-engine, Firecrawl's solution for anti-bot pages, being closed source is the biggest deal breaker requiring us to maintain this. Further, our purposes not requiring the SaaS and AI dependencies also pushes our use-case far enough away from Firecrawl's current mission that it doesn't seem like merging into the upstream is viable at this time.

## How to self host?

You should add the following services to your docker-compose as follows. We trust that you can configure Kubernetes or other hosting solutions to run these services.

```yaml
name: firecrawl
services:
  # Firecrawl services
  playwright-service:
    image: trieve/puppeteer-service-ts:v0.0.6
    environment:
      - PORT=3000
      - PROXY_SERVER=${PROXY_SERVER}
      - PROXY_USERNAME=${PROXY_USERNAME}
      - PROXY_PASSWORD=${PROXY_PASSWORD}
      - BLOCK_MEDIA=${BLOCK_MEDIA}
      - MAX_CONCURRENCY=${MAX_CONCURRENCY}
      - TWOCAPTCHA_TOKEN=${TWOCAPTCHA_TOKEN}
    networks:
      - backend

  firecrawl-api:
    image: trieve/firecrawl:v0.0.46
    networks:
      - backend
    environment:
      - REDIS_URL=${FIRECRAWL_REDIS_URL:-redis://redis:6379}
      - REDIS_RATE_LIMIT_URL=${FIRECRAWL_REDIS_URL:-redis://redis:6379}
      - PLAYWRIGHT_MICROSERVICE_URL=${PLAYWRIGHT_MICROSERVICE_URL:-http://playwright-service:3000}
      - PORT=${PORT:-3002}
      - NUM_WORKERS_PER_QUEUE=${NUM_WORKERS_PER_QUEUE}
      - BULL_AUTH_KEY=${BULL_AUTH_KEY}
      - TEST_API_KEY=${TEST_API_KEY}
      - HOST=${HOST:-0.0.0.0}
      - SELF_HOSTED_WEBHOOK_URL=${SELF_HOSTED_WEBHOOK_URL}
      - LOGGING_LEVEL=${LOGGING_LEVEL}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      - playwright-service
    ports:
      - "3002:3002"
    command: ["pnpm", "run", "start:production"]

  firecrawl-worker:
    image: trieve/firecrawl:v0.0.46
    networks:
      - backend
    environment:
      - REDIS_URL=${FIRECRAWL_REDIS_URL:-redis://redis:6379}
      - REDIS_RATE_LIMIT_URL=${FIRECRAWL_REDIS_URL:-redis://redis:6379}
      - PLAYWRIGHT_MICROSERVICE_URL=${PLAYWRIGHT_MICROSERVICE_URL:-http://playwright-service:3000}
      - PORT=${PORT:-3002}
      - NUM_WORKERS_PER_QUEUE=${NUM_WORKERS_PER_QUEUE}
      - BULL_AUTH_KEY=${BULL_AUTH_KEY}
      - TEST_API_KEY=${TEST_API_KEY}
      - SCRAPING_BEE_API_KEY=${SCRAPING_BEE_API_KEY}
      - HOST=${HOST:-0.0.0.0}
      - SELF_HOSTED_WEBHOOK_URL=${SELF_HOSTED_WEBHOOK_URL}
      - LOGGING_LEVEL=${LOGGING_LEVEL}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      - playwright-service
      - firecrawl-api
    command: ["pnpm", "run", "workers"]

  redis:
    image: redis:alpine
    networks:
      - backend
    command: redis-server --bind 0.0.0.0

networks:
  backend:
    driver: bridge
```

Oxylabs env values are recommended for the proxy and optionally also consider setting up 2captcha.

### Architecture

Firecrawl simple works as follows:

1. `crawl` endpoint starts on a URL and gets the sitemap or HTML for the page depending on request
2. URL's from the sitemap or HTML which match the `include` and `exclude` criteria are added to the redis queue
3. Workers pick those URL's and get their HTML using the `/scrape` endpoint on the `playwright-service`.
4. URL's which have not already been scraped and match the `include` and `exclude` criteria from the HTML received from the scrape get added to the queue from each worker
5. Steps 2-4 continue until no new links are found or the `limit` specified on the crawl is reached

### Scaling concerns

Your scaling bottlenecks will be the following in-order:

1. `MAX_CONCURRENCY` (number of headless puppeteer browsers) on each of the `playwright-service`
2. Actual number of `playwright-service`'s you have behind your load-balancer
3. Number of `firecrawl-worker`'s you have (very rarely the case this is your bottleneck)

### Crawling

Used to crawl a URL and all accessible subpages. This submits a crawl job and returns a job ID to check the status of the crawl.

```bash
curl -X POST https://<your-url>/v1/crawl \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer fc-YOUR_API_KEY' \
    -d '{
      "url": "https://docs.firecrawl.dev",
      "limit": 100,
      "scrapeOptions": {
        "formats": ["markdown", "html"]
      }
    }'
```

Returns a crawl job id and the url to check the status of the crawl.

```json
{
  "success": true,
  "id": "123-456-789",
  "url": "https://<your-url>/v1/crawl/123-456-789"
}
```

### Check Crawl Job

Used to check the status of a crawl job and get its result.

```bash
curl -X GET https://<your-url>/v1/crawl/123-456-789 \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

```json
{
  "status": "completed",
  "total": 36,
  "expiresAt": "2024-00-00T00:00:00.000Z",
  "data": [
    {
      "markdown": "[Firecrawl Docs home page![light logo](https://mintlify.s3-us-west-1.amazonaws.com/firecrawl/logo/light.svg)!...",
      "html": "<!DOCTYPE html><html lang=\"en\" class=\"js-focus-visible lg:[--scroll-mt:9.5rem]\" data-js-focus-visible=\"\">...",
      "metadata": {
        "title": "Build a 'Chat with website' using Groq Llama 3 | Firecrawl",
        "language": "en",
        "sourceURL": "https://docs.firecrawl.dev/learn/rag-llama3",
        "description": "Learn how to use Firecrawl, Groq Llama 3, and Langchain to build a 'Chat with your website' bot.",
        "ogLocaleAlternate": [],
        "statusCode": 200
      }
    }
  ]
}
```

### Scraping

Used to scrape a URL and get its content in the specified formats.

```bash
curl -X POST https://<your-url>/v1/scrape \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer YOUR_API_KEY' \
    -d '{
      "url": "https://docs.firecrawl.dev",
      "formats" : ["markdown", "html"]
    }'
```

Response:

```json
{
  "success": true,
  "data": {
    "markdown": "Launch Week I is here! [See our Day 2 Release 🚀](https://www.firecrawl.dev/blog/launch-week-i-day-2-doubled-rate-limits)[💥 Get 2 months free...",
    "html": "<!DOCTYPE html><html lang=\"en\" class=\"light\" style=\"color-scheme: light;\"><body class=\"__variable_36bd41 __variable_d7dc5d font-inter ...",
    "metadata": {
      "title": "Home - Firecrawl",
      "description": "Firecrawl crawls and converts any website into clean markdown.",
      "language": "en",
      "keywords": "Firecrawl,Markdown,Data,Mendable,Langchain",
      "robots": "follow, index",
      "ogTitle": "Firecrawl",
      "ogDescription": "Turn any website into LLM-ready data.",
      "ogUrl": "https://www.firecrawl.dev/",
      "ogImage": "https://www.firecrawl.dev/og.png?123",
      "ogLocaleAlternate": [],
      "ogSiteName": "Firecrawl",
      "sourceURL": "https://firecrawl.dev",
      "statusCode": 200
    }
  }
}
```
