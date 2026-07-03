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
# Stage 2 — Build the server & assemble the final image
# ============================================================
FROM node:22-alpine AS server

# bcrypt needs build tools on Alpine; ffmpeg for video resolution detection
RUN apk add --no-cache python3 make g++ ffmpeg

WORKDIR /app

# ---- Server dependencies ----
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev

# ---- Server source code ----
COPY server/ ./server/

# ---- Built client assets ----
COPY --from=client-builder /app/client/dist ./client/dist

# ---- Runtime data directory ----
RUN mkdir -p /app/server/data

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
