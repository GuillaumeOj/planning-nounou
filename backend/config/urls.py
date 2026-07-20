"""Root URL configuration for the Ma Garde Sereine backend."""

from django.conf import settings
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    # Admin is mounted under /api/ at a secret, per-environment segment (settings.ADMIN_PATH)
    # so Vercel's /api -> backend rewrite reaches it — see the ADMIN_PATH note in settings.py.
    path(f"api/{settings.ADMIN_PATH}/", admin.site.urls),
    path("api/", include("accounts.urls")),
    path("api/", include("children.urls")),
    path("api/", include("contracts.urls")),
    path("api/", include("reference.urls")),
]
