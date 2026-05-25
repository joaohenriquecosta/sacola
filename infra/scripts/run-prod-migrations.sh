#!/usr/bin/env bash
# Runs node-pg-migrate against the Neon direct (non-pooled) URL during the
# Vercel build step. We normalize `sslmode=require` because the integration
# does not always inject it on the build-time URL, and Neon refuses cleartext
# connections.

set -euo pipefail

URL="${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED must be set in the Vercel project (provided by the Neon-Vercel integration)}"

case "$URL" in
  *sslmode=*) ;;
  *\?*)       URL="${URL}&sslmode=require" ;;
  *)          URL="${URL}?sslmode=require" ;;
esac

exec env DATABASE_URL="$URL" node-pg-migrate -m infra/migrations up
