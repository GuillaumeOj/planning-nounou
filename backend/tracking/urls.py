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
contract_paid_leave = views.ContractViewSet.as_view({"get": "paid_leave"})
contract_attach_family = views.ContractViewSet.as_view({"post": "attach_family"})
terms_list = views.ContractTermsViewSet.as_view({"get": "list", "post": "create"})
terms_detail = views.ContractTermsViewSet.as_view(
    {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
)
schedule_list = views.ContractScheduleViewSet.as_view({"get": "list", "post": "create"})
schedule_detail = views.ContractScheduleViewSet.as_view(
    {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
)
leave_list = views.LeaveViewSet.as_view({"get": "list", "post": "create"})
leave_detail = views.LeaveViewSet.as_view(
    {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
)
contract_child_list = views.ContractChildViewSet.as_view({"get": "list", "post": "create"})
contract_child_detail = views.ContractChildViewSet.as_view(
    {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
)
exceptional_hours_list = views.ExceptionalHoursViewSet.as_view({"get": "list", "post": "create"})
exceptional_hours_detail = views.ExceptionalHoursViewSet.as_view(
    {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
)
exceptional_presence_list = views.ExceptionalPresenceViewSet.as_view(
    {"get": "list", "post": "create"}
)
exceptional_presence_detail = views.ExceptionalPresenceViewSet.as_view(
    {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
)
declaration_list = views.MonthlyDeclarationViewSet.as_view({"get": "list"})
declaration_detail = views.MonthlyDeclarationViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update"}
)
declaration_file = views.MonthlyDeclarationViewSet.as_view({"post": "file"})
invitation_list = views.ContractInvitationViewSet.as_view({"get": "list", "post": "create"})
invitation_detail = views.ContractInvitationViewSet.as_view({"delete": "destroy"})

urlpatterns = [
    path("health/", views.health, name="health"),
    path("minimum-wage/", views.MinimumWageView.as_view(), name="minimum-wage"),
    # National work-free days (jours fériés), global and admin-managed.
    path("holidays/", views.BankHolidayListView.as_view(), name="bank-holidays"),
    # A family's shared contracts.
    path("families/<uuid:family_pk>/contracts/", contract_list, name="family-contracts"),
    path(
        "families/<uuid:family_pk>/contracts/<uuid:pk>/",
        contract_detail,
        name="family-contract",
    ),
    # The nanny's paid-leave balance for the current reference period.
    path(
        "families/<uuid:family_pk>/contracts/<uuid:pk>/paid-leave/",
        contract_paid_leave,
        name="contract-paid-leave",
    ),
    # Attach a family the acting user also manages directly to the contract.
    path(
        "families/<uuid:family_pk>/contracts/<uuid:pk>/attach-family/",
        contract_attach_family,
        name="contract-attach-family",
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
    # A contract's days off (leaves).
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/leaves/",
        leave_list,
        name="contract-leaves",
    ),
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/leaves/<uuid:pk>/",
        leave_detail,
        name="contract-leave",
    ),
    # Invitations to share a contract with another family.
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/children/",
        contract_child_list,
        name="contract-children",
    ),
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/children/<uuid:pk>/",
        contract_child_detail,
        name="contract-child",
    ),
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/exceptional-hours/",
        exceptional_hours_list,
        name="contract-exceptional-hours",
    ),
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/exceptional-hours/<uuid:pk>/",
        exceptional_hours_detail,
        name="contract-exceptional-hour",
    ),
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/exceptional-presences/",
        exceptional_presence_list,
        name="contract-exceptional-presences",
    ),
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/exceptional-presences/<uuid:pk>/",
        exceptional_presence_detail,
        name="contract-exceptional-presence",
    ),
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/declarations/",
        declaration_list,
        name="contract-declarations",
    ),
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/declarations/<uuid:pk>/",
        declaration_detail,
        name="contract-declaration",
    ),
    path(
        "families/<uuid:family_pk>/contracts/<uuid:contract_pk>/declarations/<uuid:pk>/file/",
        declaration_file,
        name="contract-declaration-file",
    ),
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
