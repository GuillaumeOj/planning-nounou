#!/usr/bin/env bash
# Vercel build step for the backend service (cwd is backend/, the service root).
# collectstatic is NOT run here — Vercel runs it automatically when STATIC_ROOT is set.
set -euo pipefail

# Each environment has its own Neon database via prefixed env vars: NANNY_*
# (production) and NANNY_PREVIEW_* (preview). Migrate both; skip local builds.
case "${VERCEL_ENV:-}" in
  production) prefix="NANNY_" ;;
  preview) prefix="NANNY_PREVIEW_" ;;
  *)
    echo "VERCEL_ENV=${VERCEL_ENV:-unset} — skipping migrations"
    exit 0
    ;;
esac

# settings.py reads ${prefix}DATABASE_URL (pooled). For migrations we override that
# same name with the direct/unpooled endpoint — Neon's pooled PgBouncer (transaction
# mode) is unreliable for DDL and migration advisory locks.
pooled_var="${prefix}DATABASE_URL"
unpooled_var="${prefix}DATABASE_URL_UNPOOLED"
unpooled_val="${!unpooled_var:?${unpooled_var} is not set}"

echo "VERCEL_ENV=${VERCEL_ENV} — applying migrations via the direct (unpooled) endpoint"
env "${pooled_var}=${unpooled_val}" python manage.py migrate --noinput
