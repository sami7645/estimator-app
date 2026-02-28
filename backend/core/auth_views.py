"""
Auth API: register, login, logout, current user, change password.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import get_user_model

from .models import Subscription, SubscriptionPlan, SubscriptionStatus, PrivacyAgreement

User = get_user_model()


def _user_data(user):
    """Build user response dict with subscription and privacy status."""
    data = {
        "id": user.id,
        "username": user.username,
        "email": user.email or "",
    }
    try:
        sub = Subscription.objects.get(owner=user)
        data["subscription"] = {
            "plan": sub.plan,
            "status": sub.status,
            "is_active": sub.is_active,
        }
    except Subscription.DoesNotExist:
        data["subscription"] = None

    try:
        pa = PrivacyAgreement.objects.get(user=user)
        data["privacy_agreed"] = pa.agreed
    except PrivacyAgreement.DoesNotExist:
        data["privacy_agreed"] = False

    return data


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    """Create user and return token. Body: username, email, password."""
    username = request.data.get("username")
    email = request.data.get("email")
    password = request.data.get("password")
    if not username or not password:
        return Response(
            {"detail": "username and password are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if User.objects.filter(username=username).exists():
        return Response(
            {"detail": "A user with that username already exists."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if email and User.objects.filter(email=email).exists():
        return Response(
            {"detail": "A user with that email already exists."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user = User.objects.create_user(
        username=username,
        email=email or "",
        password=password,
    )
    token, _ = Token.objects.get_or_create(user=user)
    return Response(
        {
            "token": token.key,
            "user": _user_data(user),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    """Authenticate and return token. Body: username, password."""
    from django.contrib.auth import authenticate

    username = request.data.get("username")
    password = request.data.get("password")
    if not username or not password:
        return Response(
            {"detail": "username and password are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response(
            {"detail": "Invalid credentials"},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    token, _ = Token.objects.get_or_create(user=user)
    return Response(
        {
            "token": token.key,
            "user": _user_data(user),
        },
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    """Invalidate token (delete) so it cannot be reused."""
    try:
        request.user.auth_token.delete()
    except Exception:
        pass
    return Response({"detail": "Logged out"}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    """Return current user info with subscription and privacy status."""
    return Response(_user_data(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    """Change password. Body: current_password, new_password."""
    current_password = request.data.get("current_password")
    new_password = request.data.get("new_password")
    if not current_password or not new_password:
        return Response(
            {"detail": "current_password and new_password are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not request.user.check_password(current_password):
        return Response(
            {"detail": "Current password is incorrect"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(new_password) < 8:
        return Response(
            {"detail": "New password must be at least 8 characters"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    request.user.set_password(new_password)
    request.user.save()
    return Response({"detail": "Password updated successfully"})
