#!/usr/bin/env bash
# Vercel build step for the backend service, invoked as the service's buildCommand in
# vercel.json (cwd is backend/). This only fires because the service sets
# framework: "django", which engages Vercel's Django build pipeline; a plain Python
# service runs no build command. Runs after deps install, before deploy.
set -euo pipefail

# Collect static assets so WhiteNoise can serve the Django admin + DRF browsable API at
# runtime. Defining our own buildCommand overrides Vercel's automatic collectstatic, so we
# run it ourselves. The builder bundles the function by tracing imports and won't pick up
# this generated dir on its own, so vercel.json's backend function sets
# includeFiles: "staticfiles/**" to force staticfiles/ into the function bundle.
echo "Collecting static files"
python manage.py collectstatic --noinput

# On Vercel, production and preview each hold their own DATABASE_URL (its own Neon
# database); the same var name resolves to the right one per environment. Migrate on
# both; skip local builds (no VERCEL_ENV).
case "${VERCEL_ENV:-}" in
  production | preview) ;;
  *)
    echo "VERCEL_ENV=${VERCEL_ENV:-unset} — skipping migrations"
    exit 0
    ;;
esac

# settings.py reads DATABASE_URL (pooled). For migrations we override that same name with
# the direct/unpooled endpoint (DATABASE_URL_UNPOOLED) — Neon's pooled PgBouncer
# (transaction mode) is unreliable for DDL and migration advisory locks.
unpooled_val="${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED is not set}"

echo "VERCEL_ENV=${VERCEL_ENV} — applying migrations via the direct (unpooled) endpoint"
env "DATABASE_URL=${unpooled_val}" python manage.py migrate --noinput
