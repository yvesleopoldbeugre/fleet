# Builds a Fleet server image directly from this repository's source code
# (including any local modifications), instead of pulling the official
# fleetdm/fleet image from Docker Hub.
#
# Usage:
#   docker build -t my-fleet:custom .
#   docker build --build-arg FLEET_VERSION=$(git describe --tags --always) -t my-fleet:custom .

# ---- Stage 1: build fleet + fleetctl from source ----
FROM golang:1.26-bookworm AS builder

ARG FLEET_VERSION=custom

# Node.js 24 (matches package.json "engines".node) + Yarn copied from official node image
COPY --from=node:24-bookworm /usr/local/bin/node /usr/local/bin/node
COPY --from=node:24-bookworm /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx && \
    npm install -g yarn && \
    apt-get update && \
    apt-get install -y --no-install-recommends make && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /fleet
COPY . .

RUN make deps
RUN make generate
RUN make fleet-static
RUN make fleetctl

# ---- Stage 2: minimal runtime image ----
FROM alpine:3.23
LABEL org.opencontainers.image.title="fleet (custom build)"
LABEL org.opencontainers.image.source="local"

RUN apk --update add ca-certificates && \
    apk --no-cache add jq && \
    apk --no-cache upgrade openssl libcrypto3 libssl3

RUN addgroup -S fleet && adduser -S fleet -G fleet

COPY --from=builder /fleet/build/fleet /usr/bin/fleet
COPY --from=builder /fleet/build/fleetctl /usr/bin/fleetctl

USER fleet

CMD ["fleet", "serve"]
