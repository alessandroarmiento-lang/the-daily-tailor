#!/bin/sh
# Start Next (standalone) + supercronic for 06:00 Europe/Rome morning-warm.
set -eu

PORT="${PORT:-8080}"
export PORT
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export TZ="${TZ:-Europe/Rome}"
export NEWSPAPER_TIMEZONE="${NEWSPAPER_TIMEZONE:-Europe/Rome}"
export EDITIONS_DIR="${EDITIONS_DIR:-/data/editions}"

mkdir -p "$EDITIONS_DIR"

CRON_FILE=/tmp/daily-tailor.crontab
sed "s/__PORT__/${PORT}/g" /app/deploy/fly/crontab > "$CRON_FILE"

supercronic "$CRON_FILE" &
exec node server.js
