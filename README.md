# planning-nounou

Track the hours a nanny works for two families over the year.

- **Backend**: Django + Django REST Framework, PostgreSQL. `uv` for package management.
- **Frontend**: React (Vite + TypeScript). `bun` for package management.
- **Local dev**: Docker Compose (Django + Postgres).
- **Production**: Vercel — Django as a Python function, React as a static SPA, Postgres on Neon.

> Status: **skeleton**. Domain models (Family, Nanny, Employment, WorkEntry) are intentionally
> deferred; only a `/api/health/` endpoint exists so far.

```
planning-nounou/
├── backend/        # Django project (config/) + tracking app; uv-managed
├── frontend/       # Vite React SPA; bun-managed
└── docker-compose.yml
```

## Local development

### Backend + database (Docker)

```bash
docker compose up --build
```

- API: http://localhost:8000/api/health/ → `{"status":"ok"}`
- Django admin: http://localhost:8000/admin/
- Postgres is exposed on `localhost:5432` (`nounou` / `nounou`).

The `web` container runs `migrate`, `collectstatic`, then `runserver` on start.

Create an admin user:

```bash
docker compose exec web python manage.py createsuperuser
```

### Backend without Docker

Requires a running Postgres (e.g. `docker compose up db`). Then:

```bash
cd backend
cp .env.example .env        # adjust if needed
uv sync
uv run python manage.py migrate
uv run python manage.py runserver
```

### Tests, lint, and dev stack via tox

`tox` (with `tox-uv`, so environments are built from `uv.lock`) drives the backend:

```bash
cd backend
uv run tox              # tests (pytest) + lint (ruff) + types (ty) — all blocking
uv run tox -e py313     # tests only (pytest)
uv run tox -e lint      # ruff only
uv run tox -e type      # ty type-check only
uv run tox -e dev       # start the local dev stack
```

Tests run on **pytest** (via `pytest-django`). Type-checking uses **ty** with the Django/DRF
stub packages, and is part of the default `tox` run, so type errors fail the build.

`tox -e dev` starts the Postgres container (`docker compose up -d --wait db`), applies
migrations, and runs Django's dev server with hot reload on http://localhost:8000. It needs
Docker running. Tests default to the Dockerized Postgres via `DATABASE_URL`; override the env
var to point elsewhere.

### Frontend

```bash
cd frontend
bun install
bun run dev                 # http://localhost:5173, proxies /api -> :8000
```

Checks:

```bash
bun run typecheck           # tsc -b (no emit)
bun run lint                # biome check --write (lint + format + import sorting, applies fixes)
bun run format              # biome format --write .
bun run build
```

Linting, formatting, and import sorting are handled by **Biome** (`biome.json`).

## Dependency policy

All dependencies are pinned to **exact versions** (backend `pyproject.toml`, frontend
`package.json` — `bunfig.toml` enforces exact installs). Add deps with:

```bash
cd backend  && uv add --bounds exact <pkg>          # runtime
cd backend  && uv add --dev --bounds exact <pkg>    # dev
cd frontend && bun add <pkg>                         # exact via bunfig.toml
```

## Deployment (Vercel + Neon)

Deployed as **one Vercel project** using [Services](https://vercel.com/docs/services): the
root `vercel.json` builds `frontend/` (Vite SPA) and `backend/` (Django WSGI function) as two
services and routes `/api/*` → backend, everything else → frontend on a single domain. No CORS
needed — the browser stays same-origin. Django-on-Vercel is auto-detected (Vercel finds
`manage.py`, reads `config.wsgi:application`, and runs `collectstatic` itself).

### 1. Create the project

- **Root Directory**: `/` (the repo root — the `services` block in `vercel.json` points each
  service at its own subdirectory). Services is a Beta feature; enable it on your plan if the
  deploy rejects the `services` key.
- Frontend installs via `bun` (`bun.lock`); backend installs from `pyproject.toml` + `uv.lock`,
  Python from `.python-version` (3.13).

### 2. Add Neon and env vars

- Add the **Neon** Postgres integration (Vercel Marketplace) to the project. It injects
  `DATABASE_URL` (**pooled**, `-pooler` host) and `DATABASE_URL_UNPOOLED` (**direct**), plus
  `PG*` vars. `settings.py` reads `DATABASE_URL`, so the app uses the pooled endpoint — correct
  for serverless (many short-lived invocations; `CONN_MAX_AGE=0`).
- Set the remaining env vars: `SECRET_KEY`, `DEBUG=0`, `DJANGO_ALLOWED_HOSTS`,
  `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`.
- Static files (incl. admin) are collected automatically and served from the Vercel CDN.

### 3. Migrations

Migrations never run in the serverless runtime, and pooled (PgBouncer) connections are unreliable
for DDL — run them from your machine against Neon's **direct** connection:

```bash
cd backend
vercel pull                              # writes env (incl. DATABASE_URL_UNPOOLED) to .env.local
DATABASE_URL="$(grep DATABASE_URL_UNPOOLED .env.local | cut -d= -f2-)" \
  uv run python manage.py migrate
```
