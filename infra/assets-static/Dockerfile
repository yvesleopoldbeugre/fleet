# Builds the exact same frontend bundle Fleet's own Dockerfile produces --
# using Fleet's own, completely unmodified webpack.config.js -- in a
# separate build context, so Fleet's own Dockerfile/webpack.config.js/
# server code never need to change. Pairs with infra/reverse-proxy/, which
# routes /assets/* here and everything else to the unmodified `fleet`
# container. See infra/reverse-proxy/README.md.
#
# Usage (from repo root):
#   docker build -f infra/assets-static/Dockerfile -t fleet-assets-static .

FROM node:24-bookworm AS build

WORKDIR /fleet

COPY package.json yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile

COPY webpack.config.js babel.config.json tsconfig.json postcss.config.js ./
COPY frontend ./frontend

ENV NODE_ENV=production
RUN yarn run webpack

# ---- Static host ----
FROM nginx:1.27-alpine
COPY --from=build /fleet/assets /usr/share/nginx/html/assets
COPY infra/assets-static/nginx-assets.conf /etc/nginx/conf.d/default.conf
