# Firecrawl Render Deployment

This repository contains the configuration files needed to deploy Firecrawl on Render.com.

## Structure
```
.
├── apps/
│   ├── api/
│   │   └── Dockerfile          # Dockerfile for the API service
│   └── playwright-service/
│       └── Dockerfile          # Dockerfile for the Playwright service
├── render.yaml                 # Render deployment configuration
└── README.md
```

## Deployment Steps

1. Fork this repository
2. Go to [render.com](https://render.com) and create an account
3. Connect your GitHub repository
4. Click on "New +" and select "Infrastructure as Code (IaC)"
5. Select your repository and branch
6. Render will automatically detect the `render.yaml` file and create all services

## Services

- **firecrawl-api**: Main API service
- **firecrawl-worker**: Background worker service
- **firecrawl-playwright**: Playwright service for web scraping
- **firecrawl-redis**: Redis instance for queue management

## Environment Variables

The basic configuration is included in `render.yaml`. For additional features, you can add these optional environment variables through the Render dashboard:

- `OPENAI_API_KEY`: For LLM-dependent features
- `SLACK_WEBHOOK_URL`: For server health status messages
- `LLAMAPARSE_API_KEY`: For PDF parsing
- `POSTHOG_API_KEY`: For event logging
- `SCRAPING_BEE_API_KEY`: For fallback scraping

## Testing

Once deployed, you can test the API using:

```bash
curl -X POST https://firecrawl-api.onrender.com/v1/crawl \
    -H 'Content-Type: application/json' \
    -d '{
      "url": "https://mendable.ai"
    }'
```
