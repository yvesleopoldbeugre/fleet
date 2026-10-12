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

# ASSETS_BASE_URL points the frontend's JS/CSS/image references at a
# separate static host (e.g. the "assets" stage below, or a CDN) instead of
# this same Fleet server. Empty (default) preserves the original same-origin
# "/assets/..." behavior -- bindata still embeds the built assets either way,
# so the runtime stage works unmodified whether or not ASSETS_BASE_URL is set.
ARG ASSETS_BASE_URL=""
ENV ASSETS_BASE_URL=$ASSETS_BASE_URL

RUN make deps
RUN make generate
RUN make fleet-static
RUN make fleetctl

# ---- Stage 2: minimal runtime image (API + frontend HTML, same as before) ----
FROM alpine:3.23 AS runtime
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

# ---- Stage 3: static asset server (opt-in, see ASSETS_BASE_URL above) ----
# Serves the exact same webpack output the runtime stage embedded, so the
# URLs react.tmpl was built with (when ASSETS_BASE_URL points here) actually
# resolve. Only useful when ASSETS_BASE_URL was set for this build --
# otherwise nothing references this stage's output and it can be ignored.
FROM nginx:1.27-alpine AS assets
COPY --from=builder /fleet/assets /usr/share/nginx/html/assets
COPY tools/nginx-assets/nginx-assets.conf /etc/nginx/conf.d/default.conf
