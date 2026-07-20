from rest_framework import permissions, viewsets
from rest_framework.serializers import BaseSerializer

from accounts.views import FamilyScopedMixin

from .models import Child
from .serializers import ChildSerializer


class ChildViewSet(FamilyScopedMixin, viewsets.ModelViewSet):
    """CRUD for a family's children, scoped to families the user can access."""

    serializer_class = ChildSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Child.objects.filter(family=self.get_family())

    def perform_create(self, serializer: BaseSerializer[Child]) -> None:
        serializer.save(family=self.get_family())
