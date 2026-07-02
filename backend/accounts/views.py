from typing import cast

from rest_framework import generics, permissions

from .models import User
from .serializers import RegisterSerializer, UserSerializer


class RegisterView(generics.CreateAPIView):
    """Create a new user account. Open to anonymous callers."""

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MeView(generics.RetrieveAPIView):
    """Return the currently authenticated user."""

    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self) -> User:
        # IsAuthenticated guarantees an authenticated User here, but the request
        # type is the broader AbstractBaseUser | AnonymousUser union.
        return cast(User, self.request.user)
