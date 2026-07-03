from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

app_name = "accounts"

router = DefaultRouter()
router.register("families", views.FamilyViewSet, basename="family")

# Nested, family-scoped collections. Wired by hand to avoid a nested-router
# dependency; each maps HTTP verbs to viewset actions under a family_pk prefix.
child_list = views.ChildViewSet.as_view({"get": "list", "post": "create"})
child_detail = views.ChildViewSet.as_view(
    {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
)
member_list = views.FamilyMemberViewSet.as_view({"get": "list"})
member_detail = views.FamilyMemberViewSet.as_view({"delete": "destroy"})
invitation_list = views.InvitationViewSet.as_view({"get": "list", "post": "create"})
invitation_detail = views.InvitationViewSet.as_view({"delete": "destroy"})

# Account/session endpoints live under /api/auth/; the family domain lives at the
# /api/ root alongside the other resources (e.g. /api/nannies/).
auth_patterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    path("login/", TokenObtainPairView.as_view(), name="login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", views.MeView.as_view(), name="me"),
    path("email/", views.ChangeEmailView.as_view(), name="change-email"),
    path("password/", views.ChangePasswordView.as_view(), name="change-password"),
]

urlpatterns = [
    path("auth/", include(auth_patterns)),
    # Family-scoped children.
    path("families/<uuid:family_pk>/children/", child_list, name="family-children"),
    path("families/<uuid:family_pk>/children/<uuid:pk>/", child_detail, name="family-child"),
    # Family members.
    path("families/<uuid:family_pk>/members/", member_list, name="family-members"),
    path("families/<uuid:family_pk>/members/<uuid:pk>/", member_detail, name="family-member"),
    # Family invitations.
    path("families/<uuid:family_pk>/invitations/", invitation_list, name="family-invitations"),
    path(
        "families/<uuid:family_pk>/invitations/<uuid:pk>/",
        invitation_detail,
        name="family-invitation",
    ),
    # Invitations addressed to the current user (their inbox).
    path("invitations/", views.MyInvitationsView.as_view(), name="my-invitations"),
    # Token-addressed invitation flows (preview is public; accept/decline need auth).
    path(
        "invitations/<str:token>/",
        views.InvitationPreviewView.as_view(),
        name="invitation-preview",
    ),
    path(
        "invitations/<str:token>/accept/",
        views.InvitationAcceptView.as_view(),
        name="invitation-accept",
    ),
    path(
        "invitations/<str:token>/decline/",
        views.InvitationDeclineView.as_view(),
        name="invitation-decline",
    ),
    *router.urls,
]
