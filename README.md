# Ma Garde Sereine

Track the hours a nanny works for two families over the year.

- **Backend**: Django + Django REST Framework, PostgreSQL. `uv` for package management.
- **Frontend**: React (Vite + TypeScript). `bun` for package management.
- **Local dev**: Docker Compose (Django + Postgres).
- **Production**: Vercel — Django as a Python function, React as a static SPA, Postgres on Neon.

> Status: **skeleton**. Domain models (Family, Nanny, Employment, WorkEntry) are intentionally
> deferred; only a `/api/health/` endpoint exists so far.

```
ma-garde-sereine/
├── backend/        # Django project (config/) + domain apps: accounts, children, nannies, contracts, reference; uv-managed
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

- App: https://mgs-dev.local → the SPA
- API: https://mgs-dev.local/api/health/ → `{"status":"ok"}`
- Django admin: https://mgs-dev.local/api/admin/
- Postgres is exposed on `localhost:5444` (`mgs` / `mgs`).

Both containers mount their source directory, so hot reload works for Django and Vite alike.
Ctrl-C stops the log tail and leaves the stack running.

### https://mgs-dev.local

`tox -e dev` starts three services, and OrbStack serves the web-facing two at `.local` domains
over HTTPS, generating trusted certificates itself — no `/etc/hosts` entry, no certificate to
manage. It's driven by the `dev.orbstack.domains` label, so it lives in the compose file and
follows the stack into any worktree. OrbStack supports **only `.local` domains**, which is why
these aren't public-looking TLDs.

| URL | Serves |
| --- | --- |
| https://mgs-dev.local/ | the SPA (Vite) |
| https://mgs-dev.local/api/* | Django, proxied by Vite |
| https://mgs-api.local/api/* | Django, directly |
| http://localhost:5175, http://localhost:8002 | unchanged, still work |

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

If a domain ever serves the wrong container (the SPA answering `mgs-api.local`, say),
OrbStack's domain table is stale — it can get confused when a domain moves between containers.
Restarting OrbStack clears it.

Create an admin user:

```bash
docker compose exec web python manage.py createsuperuser
```

### Demo data

```bash
cd backend
uv run tox -e populate                          # accounts, families, children, nannies, contracts
uv run tox -e populate -- --families 5 --seed 3
```

Fills the dev database so the planning has something to show. It runs on the host against the
stack's Postgres — no `docker compose exec` needed — and brings the stack up first if it isn't
already.

Every account it creates logs in with the password `password`, including a superuser for the
admin, and it prints them all when it finishes. Re-running resets the demo data rather than
piling more on top; that reset is scoped to the `@demo.example.com` accounts it owns, so
anything you made by hand is left alone. Same `--seed`, same dataset.

Dev only: it refuses to run with `DEBUG` off, or on a Vercel deployment — every account it
creates shares one weak password.

### The two Docker stacks

Both Compose projects are pinned by `name` in their compose file, so they are the same
containers, image, and volume from **any git worktree** — nothing is ever named after the
checkout directory:

| Stack | Project | Compose file | Containers | Host ports |
| --- | --- | --- | --- | --- |
| dev | `mgs-development` | `docker-compose.yml` | `mgs_db`, `mgs_web`, `mgs_frontend` | 5444, 8002, 5175 |
| tests | `mgs-tests` | `docker-compose.tests.yml` | `mgs_db_test` | 5435 |

Tests get their own database so a test run can never touch your dev data. Both stacks can run
at once. Override the host ports with `MGS_DB_PORT`, `MGS_WEB_PORT`, `MGS_FRONTEND_PORT`,
`MGS_DB_PORT_TEST`.

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
the `mgs-tests` database themselves and point `DATABASE_URL` at it — set `DATABASE_URL`
yourself to test elsewhere, which is what CI does (it brings its own Postgres service and calls
`pytest` directly, so it starts no container).

### Frontend

```bash
cd frontend
bun install
bun run dev                 # http://localhost:5175, proxies /api -> :8002
```

Checks:

```bash
bun run typecheck           # tsc -b (no emit)
bun run lint                # biome check --write (lint + format + import sorting, applies fixes)
bun run format              # biome format --write .
bun run build
```

Linting, formatting, and import sorting are handled by **Biome** (`biome.json`).

### API types (schema → typed client)

The frontend does **not** hand-write API types or fetchers. The backend describes its REST API
as an OpenAPI schema with [drf-spectacular](https://drf-spectacular.readthedocs.io/), and the
frontend generates a typed [RTK Query](https://redux-toolkit.js.org/rtk-query/overview) client
(types + hooks) from it with
[`@rtk-query/codegen-openapi`](https://redux-toolkit.js.org/rtk-query/usage/code-generation). So
the two sides can never drift: change the API, regenerate, and any mismatch is a TypeScript error.

**When you change the API** (a serializer, a view, a URL, a field), regenerate both artifacts:

```bash
# 1. Re-emit the OpenAPI schema from the Django API (must be warning- and error-free)
cd backend && uv run python manage.py spectacular --file schema.yml --validate

# 2. Regenerate the frontend client (types + hooks) from that schema
cd frontend && bun run codegen
```

Then commit both **`backend/schema.yml`** and **`frontend/src/api/generated.ts`** — they are
checked-in build products, and CI/typecheck assumes they match the code.

Key files:

- `backend/config/settings.py` → `SPECTACULAR_SETTINGS` (schema options; a postprocessing hook in
  `backend/config/spectacular_hooks.py` marks response fields required so the generated types
  aren't spuriously optional). Browse the live schema at `/api/schema/swagger/`.
- `frontend/openapi-config.ts` → codegen config (reads `../backend/schema.yml`).
- `frontend/src/api/generated.ts` → **generated, do not edit by hand.**
- `frontend/src/api/emptyApi.ts` → the base RTK Query slice the generated endpoints inject into;
  `baseQuery.ts` adds the JWT bearer, 401-refresh-and-retry, and `Accept-Language`.
- `frontend/src/api/index.ts` → re-exports the generated hooks and refines a few cache tags.

Notes:

- Endpoints that build a response by hand (custom `@action`s, plain `Response({...})` dicts, or
  `SerializerMethodField`s returning loose dicts) need an `@extend_schema` / `@extend_schema_field`
  annotation so drf-spectacular can type them — otherwise `--validate` warns and the generated type
  falls back to `any`. Keep the schema generation warning-free.
- Consume the API in components via the generated hooks (`useFamiliesContractsListQuery`, …) imported
  from `@/src/api`; cache invalidation is tag-based (see `api/index.ts`), not manual.

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

### 3. Running commands against prod (migrations, seeds, …)

Nothing runs in the serverless runtime — there's no shell on the deployment. One-off commands run
**from your machine** against the production database, using the prod env pulled from Vercel.

Pull it first (decrypts the values into `backend/.vercel/.env.production.local`):

```bash
cd backend
vercel pull --environment=production     # writes .vercel/.env.production.local
```

Then run the command, loading that file with `uv run --env-file`. Two gotchas, both learned the
hard way:

- **Load with `--env-file`, never `grep … | cut`.** Vercel wraps values in double quotes
  (`DATABASE_URL_UNPOOLED="postgres://…?sslmode=require"`); `cut` keeps those quotes, so a stray
  `"` leaks into the connection string and django-environ fails with *"Engine not recognized from
  url"*. `--env-file` parses dotenv properly and does no shell expansion.
- **`SECRET_KEY` pulls back empty and is required.** It's a *Sensitive* Vercel var, so the pull
  blanks it. The file also carries `VERCEL_ENV=production`, which makes `settings.py` demand a
  non-empty `SECRET_KEY` (no dev fallback). Pass a throwaway one inline — the value is irrelevant
  for commands that sign nothing, and an inline var overrides the file's empty value:

```bash
SECRET_KEY=throwaway \
  uv run --env-file .vercel/.env.production.local \
  python manage.py seed_bank_holidays 2026
```

The file's `DATABASE_URL` is the **pooled** endpoint — fine for ORM commands like the seeds above.
**Migrations** need the **direct/unpooled** connection (pooled PgBouncer is unreliable for DDL), so
override `DATABASE_URL` with the unpooled URL just for `migrate`:

```bash
DATABASE_URL="$(grep '^DATABASE_URL_UNPOOLED=' .vercel/.env.production.local | cut -d= -f2- | tr -d '"')" \
SECRET_KEY=throwaway \
  uv run --env-file .vercel/.env.production.local \
  python manage.py migrate
```

`.vercel/` is git-ignored; the pulled file holds plaintext connection strings, so don't commit or
share it.
