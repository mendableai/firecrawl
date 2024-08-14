# Install Firecrawl on a Kubernetes Cluster (Simple Version)
# Before installing
1. Set [secret.yaml](secret.yaml) and [configmap.yaml](configmap.yaml) and do not check in secrets
2. Build Docker images, and host it in your Docker Registry (replace the target registry with your own)
   1. API (which is also used as a worker image)
      1. ```bash
         docker build --no-cache -t ghcr.io/winkk-dev/firecrawl:latest ../../../apps/api
         docker push ghcr.io/winkk-dev/firecrawl:latest
         ```
   2. Playwright 
      1. ```bash
            docker build --no-cache -t ghcr.io/winkk-dev/firecrawl-playwright:latest ../../../apps/playwright-service
            docker push ghcr.io/winkk-dev/firecrawl-playwright:latest
         ```
3. Replace the image in [worker.yaml](worker.yaml), [api.yaml](api.yaml) and [playwright-service.yaml](playwright-service.yaml)

## Install
```bash
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f playwright-service.yaml
kubectl apply -f api.yaml
kubectl apply -f worker.yaml
kubectl apply -f redis.yaml
```


# Port Forwarding for Testing
```bash
kubectl port-forward svc/api 3002:3002 -n dev
```

# Delete Firecrawl
```bash
kubectl delete -f configmap.yaml
kubectl delete -f secret.yaml
kubectl delete -f playwright-service.yaml
kubectl delete -f api.yaml
kubectl delete -f worker.yaml
kubectl delete -f redis.yaml
```