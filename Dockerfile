# Single multi-stage image: install deps → build SPA → slim Bun runtime that
# serves BOTH the API and the built SPA on one port (no nginx).

# ── deps: install once, cached on the lockfile ───────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/api/package.json packages/api/package.json
COPY packages/frontend/package.json packages/frontend/package.json
RUN bun install --frozen-lockfile

# ── build: compile the SPA (env baked in at build time) ──────────────────
FROM deps AS build
WORKDIR /app
COPY . .
ARG VITE_API_URL=""
ARG VITE_APP_NAME="TrueNote"
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
# Auth is Mode C (cookie sessions) — no token is baked into the bundle.
# By path (not a scoped --filter) so infra never depends on the package scope.
RUN cd packages/frontend && bun run build

# ── runtime: serve API + SPA ─────────────────────────────────────────────
FROM oven/bun:1 AS runtime
WORKDIR /app
# git is required: the wiki under DOCS_DIR is a git repo (per-page history).
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/app.db
ENV DOCS_DIR=/data/wiki
ENV STATIC_DIR=/app/packages/frontend/dist
COPY --from=build /app ./
RUN mkdir -p /data && chown -R bun:bun /data /app
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "run", "packages/api/src/index.ts"]
