#!/bin/sh
set -e

DATA_DIR="/app/server/data"

# When started as root (default), fix volume ownership then drop to the
# built-in "node" user. If already non-root, run directly.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR" || echo "[entrypoint] chown failed (read-only/CIFS volume?) - continuing"
  exec su-exec node "$@"
fi

exec "$@"
