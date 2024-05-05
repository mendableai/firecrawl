# Self-hosting Firecrawl

First, clone this repository and copy `.env.example` to `.env`.
```bash
git clone https://github.com/mendableai/firecrawl.git
cd firecrawl
cp .env.example .env
```

Then, edit the .env.example to have the correct values for your environment.
```
## To turn on DB authentication, you need to set up supabase.
USE_DB_AUTHENTICATION=false

# ===== Optional ENVS ======

# Supabase Setup (used to support DB authentication, advanced logging, etc.)
SUPABASE_ANON_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_TOKEN=

# Other Optionals
TEST_API_KEY= # use if you've set up authentication and want to test with a real API key
SCRAPING_BEE_API_KEY= #Set if you'd like to use scraping Be to handle JS blocking
OPENAI_API_KEY= # add for LLM dependednt features (image alt generation, etc.)
BULL_AUTH_KEY= #
LOGTAIL_KEY= # Use if you're configuring basic logging with logtail
PLAYWRIGHT_MICROSERVICE_URL=  # set if you'd like to run a playwright fallback
LLAMAPARSE_API_KEY= #Set if you have a llamaparse key you'd like to use to parse pdfs
SERPER_API_KEY= #Set if you have a serper key you'd like to use as a search api
SLACK_WEBHOOK_URL= # set if you'd like to send slack server health status messages
POSTHOG_API_KEY= # set if you'd like to send posthog events like job logs
POSTHOG_HOST= # set if you'd like to send posthog events like job logs
```

Once that's complete, you can simply run the following commands to get started:
```bash
docker compose up
```

This will run a local instance of Firecrawl which can be accessed at `http://localhost:3002`.
