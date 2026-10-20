FROM rust:1-slim-trixie AS build
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates wget && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 appuser
COPY --from=build /src/target/release/codegraph-engine /usr/local/bin/codegraph-engine
USER appuser
ENV PORT=8000
EXPOSE 8000
CMD ["codegraph-engine", "serve"]
