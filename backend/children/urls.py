from django.urls import path

from children import views

app_name = "children"

# Family-scoped, hand-wired nested collection (mirrors accounts/urls.py). The
# acting family is the <family_pk> segment.
child_list = views.ChildViewSet.as_view({"get": "list", "post": "create"})
child_detail = views.ChildViewSet.as_view(
    {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
)

urlpatterns = [
    path("families/<uuid:family_pk>/children/", child_list, name="family-children"),
    path("families/<uuid:family_pk>/children/<uuid:pk>/", child_detail, name="family-child"),
]
