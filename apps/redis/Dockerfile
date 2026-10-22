ARG REDIS_VERSION=8.8.3
FROM oliver006/redis_exporter:v1.77.0@sha256:4c8000eb3525e0f6ed1327499861e272fcce358a9e7a87dd9db74c44607e6d8e AS exporter
FROM redis:${REDIS_VERSION}

RUN apt-get update && apt-get install -y --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/*

COPY --from=exporter /redis_exporter /usr/local/bin/redis_exporter
COPY start-redis-server.sh /usr/bin/start-redis-server.sh

CMD ["/usr/bin/start-redis-server.sh"]
