# Self-hosting Firecrawl
*We're currently working on a more in-depth guide on how to self-host, but in the meantime, here is a simplified version.*

Refer to [CONTRIBUTING.md](https://github.com/mendableai/firecrawl/blob/main/CONTRIBUTING.md) for instructions on how to run it locally.

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

Update the Redis URL in the .env file to align with the Docker configuration:
```yml
REDIS_URL=redis://redis:6379
```

Once that's complete, you can simply run the following commands to get started:
```bash
docker compose up
```


This will run a local instance of Firecrawl which can be accessed at `http://localhost:3002`.
