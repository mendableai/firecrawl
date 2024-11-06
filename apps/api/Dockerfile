FROM node:20-slim AS base

# Create app directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files 
COPY apps/api/package.json apps/api/pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Install necessary build dependencies
RUN apt-get update -qq && \
    apt-get install -y \
    ca-certificates \
    git \
    golang-go \
    && update-ca-certificates

# Copy the rest of the application
COPY apps/api ./

# Build Go module
COPY apps/api/src/lib/go-html-to-md ./src/lib/go-html-to-md
RUN cd src/lib/go-html-to-md && \
    go mod tidy && \
    go build -o html-to-markdown.so -buildmode=c-shared html-to-markdown.go && \
    chmod +x html-to-markdown.so

# Build the application
RUN pnpm run build

# Install runtime dependencies
RUN apt-get install --no-install-recommends -y \
    chromium \
    chromium-sandbox \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives

# Environment setup
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"
ARG PORT=8080
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD ["pnpm", "start"]