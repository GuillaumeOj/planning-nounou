"""
Django settings for the planning-nounou backend.

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

# VERCEL_ENV is "production"/"preview" on Vercel deploys, unset locally.
_ON_VERCEL = env("VERCEL_ENV", default="") in {"production", "preview"}

# On Vercel a real SECRET_KEY must be provided (no default → startup fails loudly if it's
# missing); only local/dev falls back to the insecure placeholder.
SECRET_KEY = (
    env("SECRET_KEY")
    if _ON_VERCEL
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
ADMIN_PATH = (env("ADMIN_PATH") if _ON_VERCEL else env("ADMIN_PATH", default="admin")).strip("/")


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
    "corsheaders",
    # Local
    "accounts",
    "tracking",
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
        default="postgres://nounou:nounou@localhost:5432/nounou",
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
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
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
CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS", cast=list, default=["http://localhost:5173"])

# Behind Vercel's proxy, trust the forwarded protocol header.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = env("CSRF_TRUSTED_ORIGINS", cast=list, default=["https://*.vercel.app"])
