"""Root URL configuration for the Ma Garde Sereine backend."""

from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
)

urlpatterns = [
    # Admin is mounted under /api/ at a secret, per-environment segment (settings.ADMIN_PATH)
    # so Vercel's /api -> backend rewrite reaches it — see the ADMIN_PATH note in settings.py.
    path(f"api/{settings.ADMIN_PATH}/", admin.site.urls),
    # OpenAPI schema — the frontend RTK Query client is code-generated from /api/schema/
    # (see frontend openapi-config.ts). /api/schema/swagger/ is a human-browsable view.
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/schema/swagger/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path("api/", include("accounts.urls")),
    path("api/", include("children.urls")),
    path("api/", include("contracts.urls")),
    path("api/", include("reference.urls")),
]
