# Firecrawl Helm Chart
This Helm chart deploys Firecrawl components (API, Worker, Playwright service, Redis, etc.) on a Kubernetes cluster using environment-specific overlays.

## Pre-deployment

1. **Configure Secrets and ConfigMaps:**
   - Update `values.yaml` with the necessary environment-specific values in the `overlays/<dev|prod>/values.yaml` file.
   - **Note:** If using `REDIS_PASSWORD`, adjust the `REDIS_URL` and `REDIS_RATE_LIMIT_URL` in the ConfigMap to include the password.

2. **Build and Push Docker Images:**
   - API/Worker:
     ```bash
     docker build --no-cache --platform linux/amd64 -t ghcr.io/winkk-dev/firecrawl:latest ../../../apps/api
     docker push ghcr.io/winkk-dev/firecrawl:latest
     ```
   - Playwright Service:
     ```bash
     docker build --no-cache --platform linux/amd64 -t ghcr.io/winkk-dev/firecrawl-playwright:latest ../../../apps/playwright-service
     docker push ghcr.io/winkk-dev/firecrawl-playwright:latest
     ```

## Deployment

Render the manifests for review:
```bash
helm template winkk-ai . -f values.yaml -f overlays/dev/values.yaml -n winkk-ai
```

Deploy or upgrade the release:
```bash
helm upgrade firecrawl . -f values.yaml -f overlays/dev/values.yaml -n firecrawl --install --create-namespace
```

## Testing

Forward the API service port to your local machine:
```bash
kubectl port-forward svc/firecrawl-api 3002:3002 -n firecrawl
```

## Cleanup

To uninstall the deployment:
```bash
helm uninstall firecrawl -n firecrawl
```
```

---

This README provides a quick guide to configuring, deploying, testing, and cleaning up your Firecrawl installation using Helm.