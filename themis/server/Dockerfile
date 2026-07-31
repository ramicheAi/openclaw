# Themis API server — production container.
# Uses tsx at runtime (no separate build step needed) so the container is
# small + the server reloads identically to dev. SQLite + WAL live on a Fly
# volume mounted at /data; the THEMIS_DB env var points the server there.

FROM node:22-alpine AS base
WORKDIR /app

# Build deps for better-sqlite3 native module.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# tsx + typescript needed at runtime since we run .ts directly.
RUN npm install --no-save tsx typescript

COPY src ./src
COPY tsconfig.json ./

# Production env defaults — override with `fly secrets set` for real values.
ENV NODE_ENV=production \
    PORT=8787 \
    THEMIS_DB=/data/themis.db \
    THEMIS_AUTH_REQUIRED=1 \
    THEMIS_SECURE_COOKIES=1

EXPOSE 8787

# Use exec form so SIGTERM reaches node + the SQLite file gets a clean
# checkpoint on shutdown.
CMD ["npx", "tsx", "src/index.ts"]
