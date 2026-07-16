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

### The whole stack, one command

```bash
cd backend
uv run tox -e dev       # Postgres + Django + Vite, then tails the logs
uv run tox -e dev-down  # stop it (the database volume is kept)
```

- App: https://nanny-dev.local → the SPA
- API: https://nanny-dev.local/api/health/ → `{"status":"ok"}`
- Django admin: https://nanny-dev.local/api/admin/
- Postgres is exposed on `localhost:5432` (`nounou` / `nounou`).

Both containers mount their source directory, so hot reload works for Django and Vite alike.
Ctrl-C stops the log tail and leaves the stack running.

### https://nanny-dev.local

`tox -e dev` starts three services, and OrbStack serves the web-facing two at `.local` domains
over HTTPS, generating trusted certificates itself — no `/etc/hosts` entry, no certificate to
manage. It's driven by the `dev.orbstack.domains` label, so it lives in the compose file and
follows the stack into any worktree. OrbStack supports **only `.local` domains**, which is why
these aren't public-looking TLDs.

| URL | Serves |
| --- | --- |
| https://nanny-dev.local/ | the SPA (Vite) |
| https://nanny-dev.local/api/* | Django, proxied by Vite |
| https://nanny-api.local/api/* | Django, directly |
| http://localhost:5173, http://localhost:8000 | unchanged, still work |

The single origin is deliberate: it's the same split `vercel.json` applies in production
(`/api(/.*)?` → backend, `/(.*)` → frontend), so local routing matches prod and the browser
stays same-origin — CORS never enters the picture, exactly as on Vercel. Vite does the
proxying, so no extra reverse proxy is involved.

Two things this depends on, both easy to break:

- `server.proxy['/api'].changeOrigin` is **false** in `vite.config.ts`. Vite's shorthand
  defaults it to `true`, which rewrites the `Host` header to `web:8000` — Django then rejects
  it via `ALLOWED_HOSTS`, and builds admin redirects pointing at the internal host.
- `DJANGO_ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` in `docker-compose.yml` list these domains.
  A domain that's missing gets a Django 400, not a connection error.

If a domain ever serves the wrong container (the SPA answering `nanny-api.local`, say),
OrbStack's domain table is stale — it can get confused when a domain moves between containers.
Restarting OrbStack clears it.

Create an admin user:

```bash
docker compose exec web python manage.py createsuperuser
```

### The two Docker stacks

Both Compose projects are pinned by `name` in their compose file, so they are the same
containers, image, and volume from **any git worktree** — nothing is ever named after the
checkout directory:

| Stack | Project | Compose file | Containers | Host ports |
| --- | --- | --- | --- | --- |
| dev | `nanny-development` | `docker-compose.yml` | `nanny_db`, `nanny_web`, `nanny_frontend` | 5432, 8000, 5173 |
| tests | `nanny-tests` | `docker-compose.tests.yml` | `nanny_db_test` | 5435 |

Tests get their own database so a test run can never touch your dev data. Both stacks can run
at once. Override the host ports with `NANNY_DB_PORT`, `NANNY_WEB_PORT`, `NANNY_FRONTEND_PORT`,
`NANNY_DB_PORT_TEST`.

Because the names are pinned, only one dev stack exists at a time: starting it from a second
worktree hands the same stack over to that worktree (only `web` is recreated, so the database
keeps running). `backend/scripts/dev_stack.py` handles the conflicts this creates — it stops
stale stacks from older, directory-named projects, and clears leftover containers that collide
with the pinned names. It never removes a volume, so the database survives. A port held by
something outside this repo is reported rather than killed.

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
uv run tox -e dev       # start the whole dev stack (Postgres + Django)
uv run tox -e dev-down  # stop the dev stack
```

Tests run on **pytest** (via `pytest-django`). Type-checking uses **ty** with the Django/DRF
stub packages, and is part of the default `tox` run, so type errors fail the build.

The `dev` and test environments need Docker running; `lint` and `type` do not. Test runs start
the `nanny-tests` database themselves and point `DATABASE_URL` at it — set `DATABASE_URL`
yourself to test elsewhere, which is what CI does (it brings its own Postgres service and calls
`pytest` directly, so it starts no container).

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
