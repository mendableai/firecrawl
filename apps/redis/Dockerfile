ARG REDIS_VERSION=7.2.5
FROM bitnami/redis:${REDIS_VERSION}

COPY start-redis-server.sh /usr/bin/start-redis-server.sh

CMD ["/usr/bin/start-redis-server.sh"]
