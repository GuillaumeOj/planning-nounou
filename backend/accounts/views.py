from typing import cast

from rest_framework import generics, permissions, status, viewsets
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer

from .models import Child, User
from .serializers import (
    ChangeEmailSerializer,
    ChangePasswordSerializer,
    ChildSerializer,
    ProfileSerializer,
    RegisterSerializer,
)


class RegisterView(generics.CreateAPIView):
    """Create a new user account. Open to anonymous callers."""

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MeView(generics.RetrieveUpdateAPIView):
    """Return the current user and update their names (email stays read-only)."""

    serializer_class = ProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self) -> User:
        # IsAuthenticated guarantees an authenticated User here, but the request
        # type is the broader AbstractBaseUser | AnonymousUser union.
        return cast(User, self.request.user)


class ChangeEmailView(generics.GenericAPIView):
    """Change the current user's email after verifying the current password."""

    serializer_class = ChangeEmailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def put(self, request: Request) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(ProfileSerializer(user).data)


class ChangePasswordView(generics.GenericAPIView):
    """Change the current user's password after verifying the current password."""

    serializer_class = ChangePasswordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def put(self, request: Request) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChildViewSet(viewsets.ModelViewSet):
    """CRUD for the authenticated user's children, scoped to that user."""

    serializer_class = ChildSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Child.objects.filter(parent=self.request.user)

    def perform_create(self, serializer: BaseSerializer[Child]) -> None:
        serializer.save(parent=self.request.user)
