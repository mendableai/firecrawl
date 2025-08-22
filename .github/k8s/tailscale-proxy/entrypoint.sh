#!/bin/sh
set -e

# Start tailscaled
tailscaled --state=mem: &

# Wait for tailscaled to start
sleep 2

# Connect to tailscale
tailscale up --authkey="${TS_AUTHKEY}" --hostname="firecrawl-proxy"

# Replace FIRE_ENGINE_BETA_URL in nginx config
sed "s|\$FIRE_ENGINE_BETA_URL|${FIRE_ENGINE_BETA_URL}|g" /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Start nginx
nginx -g "daemon off;"