"""
Django settings for the planning-nounou backend.

Configuration is environment-driven via django-environ so the same code runs
locally (Docker + Postgres) and on Vercel (Python function + Neon Postgres).
"""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    DJANGO_ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1", ".vercel.app"]),
    CORS_ALLOWED_ORIGINS=(list, ["http://localhost:5173"]),
    CSRF_TRUSTED_ORIGINS=(list, ["https://*.vercel.app"]),
    CONN_MAX_AGE=(int, 0),
)

# Read a local .env file if present (ignored in production, where Vercel injects env vars).
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY", default="django-insecure-dev-only-change-me")

DEBUG = env("DEBUG")

ALLOWED_HOSTS = env("DJANGO_ALLOWED_HOSTS")


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
# Local dev defaults to the Docker Compose Postgres service; production sets
# DATABASE_URL to Neon's *pooled* connection string. CONN_MAX_AGE stays 0 on
# serverless so connections are not held open across invocations.
DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgres://nounou:nounou@localhost:5432/nounou",
    ),
}
DATABASES["default"]["CONN_MAX_AGE"] = env("CONN_MAX_AGE")


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
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# CORS — the React SPA calls the API cross-origin in dev; same-origin in prod.
CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")

# Behind Vercel's proxy, trust the forwarded protocol header.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = env("CSRF_TRUSTED_ORIGINS")
