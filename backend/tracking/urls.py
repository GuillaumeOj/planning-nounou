from django.urls import path

from . import views

app_name = "tracking"

# Family-scoped, hand-wired nested collections (mirrors accounts/urls.py). The
# acting family is the <family_pk> segment; the user acts as one of their
# families when reading/managing a shared contract.
contract_list = views.ContractViewSet.as_view({"get": "list", "post": "create"})
contract_detail = views.ContractViewSet.as_view(
    {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
)
terms_list = views.ContractTermsViewSet.as_view({"get": "list", "post": "create"})
terms_detail = views.ContractTermsViewSet.as_view(
    {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
)
schedule_list = views.ContractScheduleViewSet.as_view({"get": "list", "post": "create"})
schedule_detail = views.ContractScheduleViewSet.as_view(
    {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
)
invitation_list = views.ContractInvitationViewSet.as_view({"get": "list", "post": "create"})
invitation_detail = views.ContractInvitationViewSet.as_view({"delete": "destroy"})

urlpatterns = [
    path("health/", views.health, name="health"),
    path("minimum-wage/", views.MinimumWageView.as_view(), name="minimum-wage"),
    # A family's shared contracts.
    path("families/<uuid:family_pk>/contracts/", contract_list, name="family-contracts"),
    path(
        "families/<uuid:family_pk>/contracts/<uuid:pk>/",
        contract_detail,
        name="family-contract",
    ),
    # Versioned compensation for a contract.
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/terms/",
        terms_list,
        name="contract-terms",
    ),
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/terms/<uuid:pk>/",
        terms_detail,
        name="contract-term",
    ),
    # Versioned weekly schedule for a contract.
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/schedule/",
        schedule_list,
        name="contract-schedule",
    ),
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/schedule/<uuid:pk>/",
        schedule_detail,
        name="contract-schedule-detail",
    ),
    # Invitations to share a contract with another family.
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/invitations/",
        invitation_list,
        name="contract-invitations",
    ),
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/invitations/<uuid:pk>/",
        invitation_detail,
        name="contract-invitation",
    ),
    # Contract invitations addressed to the current user (their inbox).
    path(
        "contract-invitations/",
        views.MyContractInvitationsView.as_view(),
        name="my-contract-invitations",
    ),
    # Token-addressed flows (preview is public; accept/decline need auth).
    path(
        "contract-invitations/<str:token>/",
        views.ContractInvitationPreviewView.as_view(),
        name="contract-invitation-preview",
    ),
    path(
        "contract-invitations/<str:token>/accept/",
        views.ContractInvitationAcceptView.as_view(),
        name="contract-invitation-accept",
    ),
    path(
        "contract-invitations/<str:token>/decline/",
        views.ContractInvitationDeclineView.as_view(),
        name="contract-invitation-decline",
    ),
]
