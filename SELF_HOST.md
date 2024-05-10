# Self-hosting Firecrawl

## Getting Started

First, clone this repository and copy the example env file from api folder `.env.example` to `.env`.
```bash
git clone https://github.com/mendableai/firecrawl.git
cd firecrawl
cp ./apps/api/.env.example ./.env
```

For running the simplest version of FireCrawl, edit the `USE_DB_AUTHENTICATION` on `.env` to not use the database authentication.
```yml
USE_DB_AUTHENTICATION=false
```

Once that's complete, you can simply run the following commands to get started:
```bash
docker compose up
```

This will run a local instance of Firecrawl which can be accessed at `http://localhost:3002`.
