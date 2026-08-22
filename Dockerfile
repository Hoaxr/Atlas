# ============================================================
# Stage 1 — Build the React client
# ============================================================
FROM node:22-alpine AS client-builder

WORKDIR /app/client

COPY client/package.json client/package-lock.json* ./
RUN npm ci

COPY client/ .
RUN npm run build

# ============================================================
# Stage 2 — Install Server Dependencies
# ============================================================
FROM node:22-alpine AS server-builder

# bcrypt needs build tools on Alpine
RUN apk add --no-cache python3 make g++

WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev

# ============================================================
# Stage 3 — Assemble the final image
# ============================================================
FROM node:22-alpine AS server

# Only install runtime dependencies (ffmpeg for video resolution detection,
# su-exec to drop privileges to the node user)
RUN apk add --no-cache ffmpeg su-exec

WORKDIR /app

# ---- Server source code and modules ----
COPY server/ ./server/
COPY --from=server-builder /app/server/node_modules ./server/node_modules

# ---- Built client assets ----
COPY --from=client-builder /app/client/dist ./client/dist

# ---- Runtime data directory (owned by node; entrypoint fixes volume ownership) ----
RUN mkdir -p /app/server/data && chown node:node /app/server/data

# ---- Entrypoint (chowns data volume as root, then drops to node) ----
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 9898

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT:-3000}/api/auth/status || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
