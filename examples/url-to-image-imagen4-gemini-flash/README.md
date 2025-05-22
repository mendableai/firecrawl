# URL-to-Image Generator

Turn any website into a beautiful image using [Firecrawl](https://www.firecrawl.dev/) and cutting-edge AI.

## Technologies

- **Firecrawl**: Website content extraction
- **Google Gemini-2.5-Flash-Preview** (Released May 20, 2024): AI prompt generation
- **Google Imagen 4** (Released May 20, 2024): Latest image generation model via Fal.ai

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmendableai%2Ffirecrawl%2Ftree%2Fmain%2Fexamples&env=FIRECRAWL_API_KEY,GEMINI_API_KEY,FAL_KEY,UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN&envDescription=API%20keys%20required%20to%20run%20this%20application)

## Setup

### Required API Keys

| Service | Purpose | Get Key |
|---------|---------|---------|
| Firecrawl | Website content extraction | [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys) |
| Google Gemini | Prompt generation with Gemini-2.5-Flash | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| Fal.ai | Access to Google's Imagen 4 | [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) |
| Upstash Redis | Rate limiting (production only) | [upstash.com](https://upstash.com) |

### Quick Start

1. Clone this repository
2. Create a `.env.local` file with your API keys:
   ```
   FIRECRAWL_API_KEY=your_firecrawl_key
   GEMINI_API_KEY=your_gemini_key
   FAL_KEY=your_fal_key
   
   # For production - enables rate limiting (50 req/IP/day per endpoint)
   UPSTASH_REDIS_REST_URL=your_upstash_url
   UPSTASH_REDIS_REST_TOKEN=your_upstash_token
   ```
3. Install dependencies: `npm install` or `yarn install`
4. Run the development server: `npm run dev` or `yarn dev`

## Security Features

- **Rate Limiting**: All API endpoints are limited to 50 requests per IP address per day to prevent abuse
- **Per-endpoint Limits**: Each endpoint (imagen 4, gemini, scrape) has its own separate rate limit counter

## How It Works

1. Enter a website URL → Extract content with Firecrawl → Generate prompt with Gemini-2.5-Flash → Select style → Create image with Imagen 4 → Download

## License

MIT License