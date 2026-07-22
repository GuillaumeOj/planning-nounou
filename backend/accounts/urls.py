from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenBlacklistView

from accounts import views

app_name = "accounts"

router = DefaultRouter()
router.register("families", views.FamilyViewSet, basename="family")

# Nested, family-scoped collections. Wired by hand to avoid a nested-router
# dependency; each maps HTTP verbs to viewset actions under a family_pk prefix.
member_list = views.FamilyMemberViewSet.as_view({"get": "list"})
member_detail = views.FamilyMemberViewSet.as_view({"delete": "destroy"})
invitation_list = views.InvitationViewSet.as_view({"get": "list", "post": "create"})
invitation_detail = views.InvitationViewSet.as_view({"delete": "destroy"})

# Account/session endpoints live under /api/auth/, provided by djoser (user CRUD,
# activation, password reset, set email/password) and SimpleJWT (jwt/create,
# jwt/refresh, jwt/verify). The family domain lives at the /api/ root alongside the
# other resources (e.g. /api/nannies/).
#
# Resulting surface:
#   POST   /api/auth/users/                     register (accepts invitation_token)
#   GET/PATCH/DELETE /api/auth/users/me/        current user
#   POST   /api/auth/users/set_password/        change password (current_password guard)
#   POST   /api/auth/users/set_email/           change email    (current_password guard)
#   POST   /api/auth/users/activation/          verify email
#   POST   /api/auth/users/resend_activation/
#   POST   /api/auth/users/reset_password/      + reset_password_confirm/
#   POST   /api/auth/jwt/create/  refresh/  verify/  blacklist/  (login/refresh/logout)
auth_patterns = [
    path("", include("djoser.urls")),
    path("", include("djoser.urls.jwt")),
    # Real logout: blacklist the refresh token (token_blacklist app).
    path("jwt/blacklist/", TokenBlacklistView.as_view(), name="jwt-blacklist"),
]

urlpatterns = [
    path("auth/", include(auth_patterns)),
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
