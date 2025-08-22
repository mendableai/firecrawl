FROM alpine:latest

# Install tailscale and nginx
RUN apk add --no-cache tailscale nginx

# Configure nginx as a reverse proxy
COPY nginx.conf /etc/nginx/nginx.conf.template

# Start script that sets up tailscale and nginx
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]