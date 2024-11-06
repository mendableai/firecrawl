FROM node:18-slim

WORKDIR /usr/src/app

RUN npm install -g pnpm

COPY . .

RUN pnpm install

# Install Playwright dependencies
RUN npx playwright install --with-deps

RUN pnpm run build

ARG PORT
ENV PORT=${PORT}

EXPOSE ${PORT}

CMD [ "pnpm", "start" ]
FROM node:18-slim

# Install system dependencies for Playwright
RUN apt-get update && \
    apt-get install -y wget gnupg && \
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list && \
    apt-get update && \
    apt-get install -y \
    google-chrome-stable \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-symbola \
    fonts-noto \
    fonts-freefont-ttf \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files
COPY apps/puppeteer-service-ts/package.json apps/puppeteer-service-ts/pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application
COPY apps/puppeteer-service-ts .

# Install Playwright with dependencies
RUN npx playwright install --with-deps chromium

# Build the application
RUN pnpm run build

# Set up environment
ARG PORT=3000
ENV PORT=${PORT}
ENV PLAYWRIGHT_BROWSERS_PATH=/app/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

EXPOSE ${PORT}

CMD ["pnpm", "start"]