#!/usr/bin/env bash
# Vercel build step for the backend service, invoked via [tool.vercel.scripts] build
# in pyproject.toml (cwd is backend/). Runs after deps install, before deploy.
set -euo pipefail

# Collect static assets so WhiteNoise can serve the Django admin + DRF browsable API
# at runtime. Vercel's automatic collectstatic does not fire for this Services-model
# backend, so we run it ourselves; the output is bundled into the function.
echo "Collecting static files"
python manage.py collectstatic --noinput

# Each environment has its own Neon database via prefixed env vars: NANNY_*
# (production) and NANNY_PREVIEW_* (preview). Migrate both; skip local builds.
# NOTE: this prefix map + the ${prefix}DATABASE_URL var name mirror _ENV_PREFIX and
# the DATABASES config in config/settings.py — keep both in sync.
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
