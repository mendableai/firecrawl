# === Stage 1: Build ===
FROM node:18-slim AS builder

WORKDIR /app

# Install base build tools (but not yet Playwright deps or xvfb here)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files early for better caching
COPY package*.json ./
RUN npm install

# Copy the source code and build it
COPY . .
RUN npm run build

# === Stage 2: Runtime ===
FROM mcr.microsoft.com/playwright:v1.51.1-jammy
WORKDIR /app

# Copy built files and node_modules from builder
COPY --from=builder /app /app

# Install supervisor to manage processes
RUN apt-get update && apt-get install -y supervisor && rm -rf /var/lib/apt/lists/*

# Create startup script that cleans X locks
RUN echo '#!/bin/bash \n\
# Clean up any existing X locks \n\
rm -f /tmp/.X*-lock /tmp/.X11-unix/* \n\
# Define cleanup function \n\
cleanup() { \n\
  echo "Shutting down gracefully..." \n\
  kill -TERM $(jobs -p) 2>/dev/null || true \n\
  exit 0 \n\
} \n\
# Trap SIGTERM and SIGINT \n\
trap cleanup SIGTERM SIGINT \n\
# Start Xvfb \n\
Xvfb :99 -screen 0 1280x800x24 & \n\
XVFB_PID=$! \n\
export DISPLAY=:99 \n\
# Give Xvfb time to start \n\
sleep 1 \n\
# Start the application \n\
node dist/api.js & \n\
NODE_PID=$! \n\
# Wait for any process to exit \n\
wait -n \n\
# Exit with status of process that exited first \n\
exit $? \n\
' > /app/start.sh && chmod +x /app/start.sh

# Optional: Create non-root user for safer container
RUN useradd -m puser

# Create and set proper permissions for X11 directory
RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix && chown puser /tmp/.X11-unix

USER puser
ENV PORT=3000
EXPOSE ${PORT}

# Use the startup script
CMD ["/app/start.sh"]