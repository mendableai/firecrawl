ARG REDIS_VERSION=8.8.3
FROM redis:${REDIS_VERSION}

COPY start-redis-server.sh /usr/bin/start-redis-server.sh

RUN chown -R 1001:1001 /data
USER 1001:1001

CMD ["/usr/bin/start-redis-server.sh"]
