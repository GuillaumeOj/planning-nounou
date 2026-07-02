from django.urls import path

from . import views

app_name = "tracking"

urlpatterns = [
    path("health/", views.health, name="health"),
    path("nannies/", views.NannyListCreateView.as_view(), name="nanny-list"),
    path("nannies/<int:pk>/", views.NannyDetailView.as_view(), name="nanny-detail"),
]
