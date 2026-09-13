#!/bin/sh
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}

# Only manage user/group permissions if started as root
if [ "$(id -u)" = "0" ]; then
  GROUP_NAME=$(getent group "$PGID" | cut -d: -f1)
  if [ -z "$GROUP_NAME" ]; then
    addgroup -g "$PGID" atlas
    GROUP_NAME="atlas"
  fi

  USER_NAME=$(getent passwd "$PUID" | cut -d: -f1)
  if [ -z "$USER_NAME" ]; then
    adduser -u "$PUID" -G "$GROUP_NAME" -s /bin/sh -D atlas
    USER_NAME="atlas"
  fi

  # Ensure app data directory is owned by target user/group
  mkdir -p /app/server/data
  chown -R "$PUID:$PGID" /app/server/data

  # Drop privileges and execute CMD
  exec su-exec "$PUID:$PGID" "$@"
fi

# Already non-root
exec "$@"
