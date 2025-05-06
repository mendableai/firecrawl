# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Firecrawl is an API service that crawls and extracts data from websites, converting it into clean markdown or structured data for use in LLM-powered applications. It provides advanced scraping, crawling, and data extraction capabilities.

## Architecture

The repository is organized as a monorepo with several key components:

1. **API Service** (`/apps/api`): The core service that handles web requests, manages the crawling and data processing pipeline, and exposes the API endpoints.

2. **Worker Service**: Processes crawl and extraction jobs asynchronously using a queue system.

3. **Playwright Service** (`/apps/playwright-service-ts`): Handles browser-based rendering for JavaScript-heavy websites.

4. **SDKs**: Implementations in multiple languages (Python, Node.js, Rust) to interact with the Firecrawl API.

Key architectural components:
- Redis for job queues, caching, and rate limiting
- BullMQ for job queue management
- Express.js for the API server
- TypeScript for type safety

## Common Commands

### Development Setup

```bash
# Install dependencies
pnpm install

# Start Redis (terminal 1)
redis-server

# Start workers (terminal 2)
cd apps/api
pnpm run workers

# Start API server (terminal 3)
cd apps/api
pnpm run start
```

### Alternative: Docker Compose Setup

```bash
# Start all services with Docker Compose
docker compose up

# Or build and start
docker compose build
docker compose up
```

### Testing

```bash
# Run tests without authentication
cd apps/api
pnpm run test:local-no-auth

# Run tests with authentication
pnpm run test:prod

# Run only snippet tests
pnpm run test:snips

# Run full test suite (excluding certain E2E tests)
pnpm run test:full
```

### Building

```bash
# Build the API service
cd apps/api
pnpm run build
```

### Formatting

```bash
# Format code with Prettier
cd apps/api
pnpm run format
```

## Testing Structure

- **Unit Tests**: Located in `__tests__` directories throughout the codebase
- **Integration Tests**: Test interaction between components
- **E2E Tests**: Multiple categories (`e2e_withAuth`, `e2e_noAuth`, `e2e_full_withAuth`)
- **Snippet Tests**: Focused tests in `src/__tests__/snips/`

## Key API Endpoints

Firecrawl exposes several RESTful API endpoints:

1. `/v1/scrape`: Scrape a single URL and get its content
2. `/v1/crawl`: Crawl a website (URL and all subpages)
3. `/v1/map`: Get all URLs on a website
4. `/v1/search`: Search the web and get content from results
5. `/v1/extract`: Extract structured data from websites using AI
6. `/v1/batch/scrape`: Batch scrape multiple URLs

## Environment Configuration

The API service requires configuration via environment variables. Key variables include:

- `REDIS_URL`: Redis connection URL
- `REDIS_RATE_LIMIT_URL`: Redis URL for rate limiting
- `USE_DB_AUTHENTICATION`: Whether to use database authentication
- `PLAYWRIGHT_MICROSERVICE_URL`: URL for the Playwright service
- `NUM_WORKERS_PER_QUEUE`: Number of worker processes per queue
- `OPENAI_API_KEY`: Required for AI-powered features like extraction
- `OPENAI_BASE_URL`: Used to configure a custom OpenAI-compatible API endpoint

### AI Provider Configuration

Firecrawl supports multiple AI providers for extraction and LLM-based features. Key configuration options:

1. **OpenAI**: 
   - Default provider for extraction features
   - Configure with `OPENAI_API_KEY` and optional `OPENAI_BASE_URL` for custom endpoints
   - The API uses the `@ai-sdk/openai` package for OpenAI integration
   - Models are configured in `src/lib/generic-ai.ts` and used in various features like `llmExtract.ts`

2. **Ollama**:
   - Enable by setting `OLLAMA_BASE_URL` environment variable
   - Configure model selection with `MODEL_NAME` and `MODEL_EMBEDDING_NAME`

3. **Other Providers**:
   - The system also supports Anthropic, Google, Groq, and other providers 
   - Each provider has specific environment variables for configuration
   - See the implementation in `src/lib/generic-ai.ts`

When self-hosting and using OpenAI-compatible APIs, ensure that both `OPENAI_API_KEY` and `OPENAI_BASE_URL` are properly passed to the Docker containers.

Refer to `.env.example` in `/apps/api` for a complete list of variables.

## Development Workflow

1. Start Redis and worker processes
2. Run the API server
3. Send requests to test functionality
4. Write and run tests for new features
5. Format code before submitting PRs

## Self-Hosting Considerations

When self-hosting Firecrawl:

1. Be aware that the self-hosted version lacks Fire-engine features available in the cloud version
2. Configure environment variables as described in SELF_HOST.md
3. Consider using Docker Compose for simplified deployment
4. For custom OpenAI-compatible endpoints, ensure the `OPENAI_BASE_URL` environment variable is properly set in the Docker environment

For details on self-hosting, refer to the [Self-Host Guide](SELF_HOST.md).