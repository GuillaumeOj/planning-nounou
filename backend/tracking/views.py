from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer

from .models import Nanny
from .serializers import NannySerializer


@api_view(["GET"])
@permission_classes([AllowAny])
def health(_request: Request) -> Response:
    """Liveness probe used by deploy health checks. Public — no auth required."""
    return Response({"status": "ok"})


class NannyListCreateView(generics.ListCreateAPIView):
    """List the requesting user's nannies or add a new one."""

    serializer_class = NannySerializer

    def get_queryset(self):
        return Nanny.objects.filter(owner=self.request.user)

    def perform_create(self, serializer: BaseSerializer) -> None:
        serializer.save(owner=self.request.user)


class NannyDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or delete one of the requesting user's nannies."""

    serializer_class = NannySerializer

    def get_queryset(self):
        return Nanny.objects.filter(owner=self.request.user)
