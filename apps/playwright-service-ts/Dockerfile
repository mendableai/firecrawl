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

# Optional: Create non-root user for safer container
RUN useradd -m puser
USER puser

ENV PORT=3000
EXPOSE ${PORT}

# Use xvfb-run for GUI support in headless environment
CMD ["bash", "-c", "Xvfb :99 -screen 0 1280x800x24 & export DISPLAY=:99 && node dist/api.js"]