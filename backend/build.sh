#!/usr/bin/env bash
# Vercel build step for the backend service, invoked via [tool.vercel.scripts] build
# in pyproject.toml (cwd is backend/). Runs after deps install, before deploy.
set -euo pipefail

# Collect static assets so WhiteNoise can serve the Django admin + DRF browsable API
# at runtime. Vercel's automatic collectstatic does not fire for this Services-model
# backend, so we run it ourselves; the output is bundled into the function.
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
