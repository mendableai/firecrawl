Self-hosting Firecrawl

## Self-hosting Firecrawl

_We're currently working on a more in-depth guide on how to self-host, but in the meantime, here is a simplified version._

Refer to [CONTRIBUTING.md](https://github.com/mendableai/firecrawl/blob/main/CONTRIBUTING.md) for instructions on how to run it locally.

## Getting Started

First, clone this repository and copy the example env file from the API folder `.env.example` to `.env`.

### Steps

1.  Clone the repository:
    
    ```bash
    git clone https://github.com/mendableai/firecrawl.git
    cd firecrawl
    cp ./apps/api/.env.example ./.env
    ```
    
2.  For running the simplest version of FireCrawl, edit the `USE_DB_AUTHENTICATION` in `.env` to not use the database authentication:
    
    ```plaintext
    USE_DB_AUTHENTICATION=false
    ```
    
3.  Update the Redis URL in the .env file to align with the Docker configuration:
    
    ```plaintext
    REDIS_URL=redis://redis:6379
    ```
    
4.  #### Option: Running with TypeScript Playwright Service
    
    *   Update the `docker-compose.yml` file to change the Playwright service:
        
        ```plaintext
            build: apps/playwright-service
        ```
        TO
        ```plaintext
            build: apps/playwright-service-ts
        ```
        
    *   Set the `PLAYWRIGHT_MICROSERVICE_URL` in your `.env` file:
        
        ```plaintext
        PLAYWRIGHT_MICROSERVICE_URL=http://localhost:3000/scrape
        ```
        
    *   Don't forget to set the proxy server in your `.env` file as needed.
5.  Build and run the Docker containers:
    
    ```bash
    docker compose build
    docker compose up
    ```
    

This will run a local instance of Firecrawl which can be accessed at `http://localhost:3002`.

## Install Firecrawl on a Kubernetes Cluster (Simple Version)

Read the [examples/kubernetes-cluster-install/README.md](https://github.com/mendableai/firecrawl/blob/main/examples/kubernetes-cluster-install/README.md) for instructions on how to install Firecrawl on a Kubernetes Cluster.