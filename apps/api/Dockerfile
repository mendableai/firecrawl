FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install && pnpm run build

FROM base AS rust-base
COPY native /app/native
WORKDIR /app/native

RUN apt-get update && apt-get install -y build-essential curl && rm -rf /var/lib/apt/lists/* && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
    . $HOME/.cargo/env && \
    pnpm install --frozen-lockfile && \
    pnpm build && \
    rm -r node_modules && \
    pnpm install --prod --frozen-lockfile

FROM base
COPY --from=build /app/dist /app/dist
COPY --from=rust-base /app/native /app/native

# Install git
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Install prod dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Start the server by default, this can be overwritten at runtime
EXPOSE 8080

# Make sure the entrypoint script has the correct line endings
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh

ENTRYPOINT "/app/docker-entrypoint.sh"
