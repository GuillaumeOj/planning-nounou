from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

app_name = "accounts"

router = DefaultRouter()
router.register("children", views.ChildViewSet, basename="child")

urlpatterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    path("login/", TokenObtainPairView.as_view(), name="login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", views.MeView.as_view(), name="me"),
    path("email/", views.ChangeEmailView.as_view(), name="change-email"),
    path("password/", views.ChangePasswordView.as_view(), name="change-password"),
    *router.urls,
]
