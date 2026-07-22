"""
Django settings for the Ma Garde Sereine backend.

Configuration is environment-driven via django-environ so the same code runs
locally (Docker + Postgres) and on Vercel (Python function + Neon Postgres).
"""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()

# Read a local .env file if present (ignored in production, where Vercel injects env vars).
environ.Env.read_env(BASE_DIR / ".env")

# Every setting is read by its bare name. On Vercel, production and preview each hold their
# own value for the same variable name (env vars are scoped per environment there), so the
# same code reads e.g. DATABASE_URL and gets the right database in each. Locally we read the
# same names from the environment / a .env file, falling back to the defaults passed below.

# VERCEL_ENV is "production"/"preview" on Vercel deploys, unset locally. Public, so code
# that must behave differently on a deployment (e.g. the populate_dev command, which
# refuses to run on one) asks this rather than re-reading the environment for itself.
ON_VERCEL = env("VERCEL_ENV", default="") in {"production", "preview"}

# On Vercel a real SECRET_KEY must be provided (no default → startup fails loudly if it's
# missing); only local/dev falls back to the insecure placeholder.
SECRET_KEY = (
    env("SECRET_KEY")
    if ON_VERCEL
    else env("SECRET_KEY", default="django-insecure-dev-only-change-me")
)

DEBUG = env("DEBUG", cast=bool, default=False)

ALLOWED_HOSTS = env(
    "DJANGO_ALLOWED_HOSTS", cast=list, default=["localhost", "127.0.0.1", ".vercel.app"]
)

# Django admin lives at a secret, per-environment path so bots can't hammer a well-known
# /admin/. It's mounted under /api/ (config/urls.py) so Vercel's /api -> backend rewrite
# reaches it — a shared vercel.json can't encode a per-env secret, so Django owns it at
# runtime. On Vercel, ADMIN_PATH must be set (production and preview each hold their own
# value; no default → startup fails if it's missing); local dev falls back to "admin".
ADMIN_PATH = (env("ADMIN_PATH") if ON_VERCEL else env("ADMIN_PATH", default="admin")).strip("/")


# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "djoser",
    "anymail",
    "corsheaders",
    # Local
    "accounts",
    "children",
    "nannies",
    "contracts",
    "reference",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # WhiteNoise serves static files (incl. Django admin assets) without a filesystem/CDN.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    # Activates the request locale from the Accept-Language header so API error
    # messages come back in the caller's language (English or French).
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Database
# On Vercel, production and preview each hold their own DATABASE_URL (its own Neon database),
# so previews never touch production data. The app uses Neon's *pooled* connection string;
# CONN_MAX_AGE stays 0 on serverless so connections aren't held open across invocations.
DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgres://mgs:mgs@localhost:5444/mgs",
    ),
}
DATABASES["default"]["CONN_MAX_AGE"] = env("CONN_MAX_AGE", cast=int, default=0)


# Custom user model — email is the login identifier (see accounts/models.py).
AUTH_USER_MODEL = "accounts.User"


# Django REST Framework — JWT bearer auth, authenticated-by-default. Individual
# public endpoints (health, register, login) opt out with AllowAny.
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # drf-spectacular introspects the views to build the OpenAPI schema the frontend
    # RTK Query client is code-generated from (see SPECTACULAR_SETTINGS + config/urls.py).
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# OpenAPI schema — the single source of truth the frontend's typed API client is
# generated from. `bun run codegen` in ../frontend reads /api/schema/ and regenerates
# the RTK Query slice + TypeScript types, so the two sides can never drift.
SPECTACULAR_SETTINGS = {
    "TITLE": "Ma Garde Sereine API",
    "DESCRIPTION": "Nanny hours tracker — REST API consumed by the SPA frontend.",
    "VERSION": "1.0.0",
    # The SPA fetches the schema itself; don't inline it into the browsable swagger UI.
    "SERVE_INCLUDE_SCHEMA": False,
    # Strip the '/api' mount prefix from operation paths so they read '/families/...'.
    # The frontend baseQuery already has baseUrl '/api'; without the trim the two would
    # double to '/api/api/...'. PREFIX matches for tag/operationId naming; PREFIX_TRIM
    # removes it from the emitted paths.
    "SCHEMA_PATH_PREFIX": r"/api",
    "SCHEMA_PATH_PREFIX_TRIM": True,
    # Split components into request/response variants so write-only/read-only fields
    # generate distinct TS types (e.g. ContractInput vs Contract) instead of one loose shape.
    "COMPONENT_SPLIT_REQUEST": True,
    # Invitation and ContractInvitation share an identical `status` choice set, which
    # collides into an auto-named `StatusA03Enum`. Pin it to a stable name so the generated
    # TS type is `InvitationStatusEnum`. Likewise the draft/filed declaration status is now
    # shared by MonthlyDeclaration and the dashboard's recent_declarations rows — pin it to
    # `MonthlyDeclarationStatusEnum` so the two reuse one enum instead of colliding.
    # A literal choice set is used rather than a dotted path because the enum lives in a
    # nested `Status` class that `import_string` can't traverse.
    "ENUM_NAME_OVERRIDES": {
        "InvitationStatusEnum": [
            ("pending", "Pending"),
            ("accepted", "Accepted"),
            ("declined", "Declined"),
            ("revoked", "Revoked"),
        ],
        "MonthlyDeclarationStatusEnum": [
            ("draft", "Draft"),
            ("filed", "Filed"),
        ],
    },
    # Keep drf-spectacular's default enum postprocessing, then mark response fields as
    # required so the generated TS response types aren't riddled with spurious optionals
    # (see config/spectacular_hooks.py for why).
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "config.spectacular_hooks.make_response_fields_required",
    ],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}


# Frontend links baked into outgoing emails (auth links via djoser below, plus the
# invitation emails in accounts/contracts). One source of truth so a deploy can't drift
# the two apart; djoser reads these through its EMAIL_FRONTEND_* keys.
FRONTEND_PROTOCOL = env("FRONTEND_PROTOCOL", default="https")
FRONTEND_DOMAIN = env("FRONTEND_DOMAIN", default="mgs-dev.local")
SITE_NAME = env("SITE_NAME", default="Ma Garde Sereine")


# djoser — battle-tested auth flows (registration, activation, password reset,
# set email/password) layered on the SimpleJWT tokens above. The custom email
# `User`, the `invitation_token` claim hook and our case-insensitive-unique-email
# messages are preserved via the serializer overrides below.
DJOSER = {
    "LOGIN_FIELD": "email",
    # The SPA sends a single password field on each of these flows (no retype).
    "USER_CREATE_PASSWORD_RETYPE": False,
    "SET_PASSWORD_RETYPE": False,
    "PASSWORD_RESET_CONFIRM_RETYPE": False,
    # Email verification: new accounts are inactive until they follow the link.
    "SEND_ACTIVATION_EMAIL": True,
    # Security/confirmation emails — each maps to a branded Brevo template below.
    "SEND_CONFIRMATION_EMAIL": True,
    "PASSWORD_CHANGED_EMAIL_CONFIRMATION": True,
    "USERNAME_CHANGED_EMAIL_CONFIRMATION": True,
    # Never expose other users through the /users/ collection.
    "HIDE_USERS": True,
    # JWT only — no DRF authtoken model (keeps rest_framework.authtoken uninstalled).
    "TOKEN_MODEL": None,
    # SPA routes the activation / reset links point at (see frontend App.tsx).
    "ACTIVATION_URL": "activate/{uid}/{token}",
    "PASSWORD_RESET_CONFIRM_URL": "reset-password/{uid}/{token}",
    # We never surface djoser's "reset your login email by email link" flow — email
    # changes go through set_email, guarded by the current password. Its confirm URL
    # is set only so the router-mounted view can't 500 on a missing setting; the two
    # username-reset endpoints are locked to staff below, so the flow is effectively off.
    "USERNAME_RESET_CONFIRM_URL": "reset-username/{uid}/{token}",
    "EMAIL_FRONTEND_PROTOCOL": FRONTEND_PROTOCOL,
    "EMAIL_FRONTEND_DOMAIN": FRONTEND_DOMAIN,
    "EMAIL_FRONTEND_SITE_NAME": SITE_NAME,
    "SERIALIZERS": {
        "user_create": "accounts.serializers.RegisterSerializer",
        "user": "accounts.serializers.ProfileSerializer",
        "current_user": "accounts.serializers.ProfileSerializer",
        "set_username": "accounts.serializers.SetEmailSerializer",
    },
    # Send Brevo-hosted, per-language templates instead of djoser's packaged HTML.
    # The classes pick the template id by the request's active language (see
    # accounts/email.py + BREVO_TEMPLATE_IDS below).
    "EMAIL": {
        "activation": "accounts.email.ActivationEmail",
        "confirmation": "accounts.email.ConfirmationEmail",
        "password_reset": "accounts.email.PasswordResetEmail",
        "password_changed_confirmation": "accounts.email.PasswordChangedConfirmationEmail",
        "username_changed_confirmation": "accounts.email.UsernameChangedConfirmationEmail",
    },
    "PERMISSIONS": {
        # Don't let a plain user enumerate accounts via the list endpoint.
        "user_list": ["rest_framework.permissions.IsAdminUser"],
        # Close djoser's unintended public email-reset-by-link routes (see above);
        # locking both to staff disables the flow without a custom URLconf.
        "username_reset": ["rest_framework.permissions.IsAdminUser"],
        "username_reset_confirm": ["rest_framework.permissions.IsAdminUser"],
    },
}


# Email — activation and password-reset messages are rendered by djoser and
# delivered through Brevo's transactional API via django-anymail. On Vercel the
# default is the Brevo backend and BREVO_API_KEY is required (no default → startup
# fails loudly if it's missing), so a misconfigured deploy can't silently drop every
# auth email to the console — the same fail-loud pattern as SECRET_KEY/ADMIN_PATH.
# Local dev defaults to the console backend, so the whole flow is testable with no key.
EMAIL_BACKEND = (
    env("EMAIL_BACKEND", default="anymail.backends.brevo.EmailBackend")
    if ON_VERCEL
    else env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
)
ANYMAIL = {"BREVO_API_KEY": env("BREVO_API_KEY") if ON_VERCEL else env("BREVO_API_KEY", default="")}
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="no-reply@mgs-dev.local")

# Brevo transactional template ids per auth email, keyed by language. The templates
# themselves live in the Brevo account (designed in the dashboard, `mgs-<key>-<lang>`);
# accounts/email.py selects the id for the request's active language (fr fallback).
# Single Brevo account, so the ids are pinned here rather than per-environment env vars.
BREVO_TEMPLATE_IDS = {
    "activation": {"fr": 1, "en": 2},
    "confirmation": {"fr": 3, "en": 4},
    "password_reset": {"fr": 5, "en": 6},
    "password_changed_confirmation": {"fr": 7, "en": 8},
    "email_changed_confirmation": {"fr": 9, "en": 10},
    # Invitations (not djoser flows) — sent from accounts/contracts serializers via
    # accounts/notifications.py. Same `mgs-<key>-<lang>` templates in the Brevo account.
    "family_invitation": {"fr": 12, "en": 13},
    "contract_invitation": {"fr": 14, "en": 15},
}


# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Internationalization
# The SPA sends Accept-Language (driven by the browser). LocaleMiddleware picks
# the best match from LANGUAGES; DRF/Django ship the built-in French strings and
# our own messages live in locale/fr/.
LANGUAGE_CODE = "en"
LANGUAGES = [
    ("en", "English"),
    ("fr", "French"),
]
LOCALE_PATHS = [BASE_DIR / "locale"]
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# Static files
# Served under /api/ so Vercel's /api -> backend rewrite delivers the Django admin (and DRF
# browsable API) assets to WhiteNoise; a bare /static/ would fall through to the SPA.
STATIC_URL = "api/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    # Non-manifest WhiteNoise storage: still gzip/brotli-compresses collected assets, but
    # {% static %} returns plain (unhashed) URLs, so runtime never has to read a
    # staticfiles.json manifest — which is fragile inside a serverless function bundle.
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

# Applies only to models that don't set their own PK — Django's built-in apps
# (auth, admin, sessions, …). Our models get a UUID-4 PK by subclassing
# config.models.UUIDModel (see there for why); new models should do the same.
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# CORS — the React SPA calls the API cross-origin in dev; same-origin in prod.
CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS", cast=list, default=["http://localhost:5175"])

# Behind Vercel's proxy, trust the forwarded protocol header.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = env("CSRF_TRUSTED_ORIGINS", cast=list, default=["https://*.vercel.app"])
