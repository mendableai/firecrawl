FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
LABEL fly_launch_runtime="Node.js"
RUN corepack enable

WORKDIR /app

# Install dependencies only
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Install all dependencies and build the application
FROM base AS build
COPY . ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile \
    && pnpm run build

# Production image
FROM node:20-slim AS prod
WORKDIR /app
RUN apt-get update -qq && apt-get install --no-install-recommends -y chromium \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

# Copy dependencies and build output
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Expose port and set default command
EXPOSE 8080
CMD ["pnpm", "run", "start:production"]
CMD ["pnpm", "run", "worker:production"]
