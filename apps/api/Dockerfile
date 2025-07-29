FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install && pnpm run build

# Install Rust
FROM rust:1-slim AS rust-base
COPY sharedLibs/html-transformer /app/sharedLibs/html-transformer
COPY sharedLibs/pdf-parser /app/sharedLibs/pdf-parser
COPY sharedLibs/crawler /app/sharedLibs/crawler

# Install Rust dependencies and build transformer lib
RUN cd /app/sharedLibs/html-transformer && \
    cargo build --release --locked && \
    chmod +x target/release/libhtml_transformer.so

# Install Rust dependencies and build PDF parser lib
RUN cd /app/sharedLibs/pdf-parser && \
    cargo build --release --locked && \
    chmod +x target/release/libpdf_parser.so

# Install Rust dependencies and build crawler lib
RUN cd /app/sharedLibs/crawler && \
    cargo build --release --locked && \
    chmod +x target/release/libcrawler.so

FROM base
COPY --from=build /app/dist /app/dist
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY ./sharedLibs/go-html-to-md /app/sharedLibs/go-html-to-md
COPY --from=rust-base /app/sharedLibs/html-transformer/target/release/libhtml_transformer.so /app/sharedLibs/html-transformer/target/release/libhtml_transformer.so
COPY --from=rust-base /app/sharedLibs/pdf-parser/target/release/libpdf_parser.so /app/sharedLibs/pdf-parser/target/release/libpdf_parser.so
COPY --from=rust-base /app/sharedLibs/crawler/target/release/libcrawler.so /app/sharedLibs/crawler/target/release/libcrawler.so

# Install Go and Git
RUN apt-get update && \
    apt-get install -y wget git && \
    wget -O go.tgz https://go.dev/dl/go1.24.5.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go.tgz && \
    rm go.tgz

ENV PATH="/usr/local/go/bin:$PATH"

# Build Go HTML-to-MD library
RUN cd /app/sharedLibs/go-html-to-md && \
    go mod download && \
    go build -o html-to-markdown.so -buildmode=c-shared html-to-markdown.go && \
    chmod +x html-to-markdown.so

# Start the server by default, this can be overwritten at runtime
EXPOSE 8080

# Make sure the entrypoint script has the correct line endings
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh

ENTRYPOINT "/app/docker-entrypoint.sh"
