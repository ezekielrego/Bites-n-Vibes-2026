from rest_framework import generics, status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.utils.crypto import get_random_string
from django.utils import timezone
from datetime import timedelta
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings
from django.http import HttpResponseRedirect
from django.utils.html import strip_tags
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from .models import PasswordResetToken, EmailLoginToken
from .serializers import (
    UserSerializer, UserRegistrationSerializer,
    PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
    PasswordChangeSerializer, SetPasswordSerializer
)

User = get_user_model()


class AppSafeRedirect(HttpResponseRedirect):
    allowed_schemes = ['http', 'https', 'ftp', 'exp', 'bitesnvibes', 'bitesapp26']


def _append_query_params(url, params):
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update({key: value for key, value in params.items() if value not in (None, '')})
    return urlunparse(parsed._replace(query=urlencode(query)))


def _default_auth_redirect(path):
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"


def _is_allowed_auth_redirect(value):
    prefixes = getattr(settings, 'AUTH_ALLOWED_REDIRECT_PREFIXES', [])
    return any(value.startswith(prefix) for prefix in prefixes if prefix)


def _resolve_auth_redirect(supplied_value, fallback_path):
    value = (supplied_value or '').strip()
    if value and _is_allowed_auth_redirect(value):
        return value
    return _default_auth_redirect(fallback_path)


def _redirect_to_auth_target(url):
    return AppSafeRedirect(url)


class UserRegistrationView(generics.CreateAPIView):
    """Register a new user."""
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        
        return Response({
            'user': UserSerializer(user, context={'request': request}).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            },
            'message': 'User registered successfully'
        }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def app_session(request):
    """Create a lightweight app session for the seeded demo account in development."""
    if not settings.DEBUG and not getattr(settings, 'ALLOW_APP_DEMO_SESSION', False):
        return Response(
            {'detail': 'App demo session is disabled.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    user, created = User.objects.get_or_create(
        email='demo@bitesnvibes.local',
        defaults={
            'name': 'Bites and Vibes Demo',
            'is_active': True,
        },
    )

    if created or not user.has_usable_password():
        user.set_password('demo12345!')
        user.save()

    refresh = RefreshToken.for_user(user)

    return Response(
        {
            'user': UserSerializer(user, context={'request': request}).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            },
            'message': 'App session created successfully',
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def user_profile(request):
    """Get current user profile."""
    serializer = UserSerializer(request.user, context={'request': request})
    return Response(serializer.data)


@api_view(['PUT', 'PATCH'])
@permission_classes([permissions.IsAuthenticated])
def update_profile(request):
    """Update current user profile."""
    serializer = UserSerializer(request.user, data=request.data, partial=True, context={'request': request})
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def change_password(request):
    """Change user password."""
    serializer = PasswordChangeSerializer(data=request.data)
    if serializer.is_valid():
        user = request.user
        old_password = serializer.validated_data.get('old_password')
        
        # Check if user has a password set
        has_password = user.has_usable_password()
        
        if has_password:
            # User has password, require old password
            if not old_password:
                return Response(
                    {'old_password': 'Old password is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if not user.check_password(old_password):
                return Response(
                    {'old_password': 'Incorrect password'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Set new password
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        return Response({'message': 'Password set successfully' if not has_password else 'Password changed successfully'})
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def set_password(request):
    """Set initial password for users who don't have one."""
    serializer = SetPasswordSerializer(data=request.data)
    if serializer.is_valid():
        user = request.user
        
        # Check if user already has a password
        if user.has_usable_password():
            return Response(
                {'error': 'Password already set. Use change password instead.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Set password
        user.set_password(serializer.validated_data['password'])
        user.save()
        return Response({'message': 'Password set successfully'})
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def password_reset_request(request):
    """Request password reset."""
    serializer = PasswordResetRequestSerializer(data=request.data)
    if serializer.is_valid():
        email = serializer.validated_data['email']
        try:
            user = User.objects.get(email=email)
            # Generate reset token
            token = get_random_string(length=64)
            expires_at = timezone.now() + timedelta(hours=24)
            
            PasswordResetToken.objects.create(
                user=user,
                token=token,
                expires_at=expires_at
            )
            
            # Send email
            reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
            send_mail(
                'Password Reset Request - Bites n Vibes',
                f'Click the link to reset your password: {reset_link}',
                settings.DEFAULT_FROM_EMAIL,
                [email],
                fail_silently=False,
            )
            
            return Response({
                'message': 'Password reset link has been sent to your email'
            })
        except User.DoesNotExist:
            # Don't reveal if user exists
            return Response({
                'message': 'If the email exists, a password reset link has been sent'
            })
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def password_reset_confirm(request):
    """Confirm password reset."""
    serializer = PasswordResetConfirmSerializer(data=request.data)
    if serializer.is_valid():
        token = serializer.validated_data['token']
        try:
            reset_token = PasswordResetToken.objects.get(
                token=token,
                used=False,
                expires_at__gt=timezone.now()
            )
            user = reset_token.user
            user.set_password(serializer.validated_data['password'])
            user.save()
            reset_token.used = True
            reset_token.save()
            
            return Response({'message': 'Password reset successfully'})
        except PasswordResetToken.DoesNotExist:
            return Response(
                {'token': 'Invalid or expired token'},
                status=status.HTTP_400_BAD_REQUEST
            )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def google_oauth_url(request):
    """Get the direct Google OAuth URL for redirect."""
    try:
        client_id = settings.SOCIALACCOUNT_PROVIDERS['google']['APP']['client_id']
        redirect_to = _resolve_auth_redirect(request.GET.get('redirect_to'), '/auth/callback')
        
        if not client_id:
            return Response(
                {'error': 'Google OAuth client_id is not configured. Please set GOOGLE_CLIENT_ID in your .env file.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        redirect_uri = f"{request.scheme}://{request.get_host()}/api/auth/google/callback/"
        scope = 'openid email profile'
        response_type = 'code'
        
        # Build query parameters
        params = {
            'client_id': client_id,
            'redirect_uri': redirect_uri,
            'response_type': response_type,
            'scope': scope,
            'access_type': 'online',
            'prompt': 'select_account',
            'state': redirect_to,
        }
        
        google_auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
        
        return Response({'url': google_auth_url})
    except KeyError as e:
        return Response(
            {'error': f'Google OAuth configuration error: {str(e)}. Please check your settings.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    except Exception as e:
        return Response(
            {'error': f'Failed to generate Google OAuth URL: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def google_oauth_callback(request):
    """Handle Google OAuth callback - exchange code for tokens and login user."""
    from django.conf import settings
    import requests
    
    code = request.GET.get('code')
    error = request.GET.get('error')
    redirect_to = _resolve_auth_redirect(request.GET.get('state'), '/auth/callback')
    
    if error:
        return _redirect_to_auth_target(_append_query_params(redirect_to, {'error': error}))
    
    if not code:
        return _redirect_to_auth_target(_append_query_params(redirect_to, {'error': 'no_code'}))
    
    try:
        # Exchange authorization code for access token
        client_id = settings.SOCIALACCOUNT_PROVIDERS['google']['APP']['client_id']
        client_secret = settings.SOCIALACCOUNT_PROVIDERS['google']['APP']['secret']
        redirect_uri = f"{request.scheme}://{request.get_host()}/api/auth/google/callback/"
        
        # Exchange code for tokens
        token_response = requests.post('https://oauth2.googleapis.com/token', data={
            'code': code,
            'client_id': client_id,
            'client_secret': client_secret,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code'
        })
        
        if token_response.status_code != 200:
            error_detail = token_response.text
            print(f"Token exchange failed: {token_response.status_code} - {error_detail}")
            print(f"Redirect URI used: {redirect_uri}")
            print(f"Client ID: {client_id[:20]}...")
            return _redirect_to_auth_target(
                _append_query_params(
                    redirect_to,
                    {
                        'error': 'token_exchange_failed',
                        'detail': error_detail[:100],
                    },
                )
            )
        
        token_data = token_response.json()
        access_token = token_data.get('access_token')
        
        if not access_token:
            return _redirect_to_auth_target(_append_query_params(redirect_to, {'error': 'no_access_token'}))
        
        # Get user info from Google
        user_response = requests.get(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            headers={'Authorization': f'Bearer {access_token}'}
        )
        
        if user_response.status_code != 200:
            return _redirect_to_auth_target(_append_query_params(redirect_to, {'error': 'user_info_failed'}))
        
        user_data = user_response.json()
        
        # Get or create user
        user, created = User.objects.get_or_create(
            email=user_data.get('email'),
            defaults={
                'name': user_data.get('name', ''),
                'avatar_url': user_data.get('picture', ''),
                'is_active': True
            }
        )
        
        # Update user info if needed
        if not created:
            updated = False
            if user_data.get('name') and not user.name:
                user.name = user_data.get('name')
                updated = True
            if user_data.get('picture') and not user.avatar_url:
                user.avatar_url = user_data.get('picture')
                updated = True
            if updated:
                user.save()
        
        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        
        # Redirect to frontend with tokens
        tokens = {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }
        
        redirect_url = _append_query_params(
            redirect_to,
            {
                'access': tokens['access'],
                'refresh': tokens['refresh'],
            },
        )
        return _redirect_to_auth_target(redirect_url)
        
    except Exception as e:
        print(f"Error in OAuth callback: {e}")
        import traceback
        traceback.print_exc()
        return _redirect_to_auth_target(_append_query_params(redirect_to, {'error': 'authentication_failed'}))


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def google_login(request):
    """Handle Google OAuth login with ID token or access token."""
    from django.conf import settings
    import requests
    
    # Accept both id_token (from Google Identity Services) and access_token (from OAuth flow)
    id_token = request.data.get('id_token') or request.data.get('credential')
    access_token = request.data.get('access_token')
    
    if not id_token and not access_token:
        return Response(
            {'error': 'ID token or access token is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        user_data = None
        
        # If ID token is provided (Google Identity Services)
        if id_token:
            # Verify ID token with Google
            response = requests.get(
                'https://oauth2.googleapis.com/tokeninfo',
                params={'id_token': id_token}
            )
            
            if response.status_code != 200:
                return Response(
                    {'error': 'Invalid ID token'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            token_info = response.json()
            
            # Get user info using the ID token
            user_data = {
                'email': token_info.get('email'),
                'name': token_info.get('name', ''),
                'picture': token_info.get('picture', ''),
            }
        
        # If access token is provided (OAuth 2.0 flow)
        elif access_token:
            response = requests.get(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                headers={'Authorization': f'Bearer {access_token}'}
            )
            
            if response.status_code != 200:
                return Response(
                    {'error': 'Invalid access token'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            user_data = response.json()
        
        if not user_data or not user_data.get('email'):
            return Response(
                {'error': 'Unable to retrieve user information'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get or create user
        user, created = User.objects.get_or_create(
            email=user_data.get('email'),
            defaults={
                'name': user_data.get('name', ''),
                'avatar_url': user_data.get('picture', ''),
                'is_active': True
            }
        )
        
        # Update user info if needed
        if not created:
            updated = False
            if user_data.get('name') and not user.name:
                user.name = user_data.get('name')
                updated = True
            if user_data.get('picture') and not user.avatar_url:
                user.avatar_url = user_data.get('picture')
                updated = True
            if updated:
                user.save()
        
        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        
        return Response({
            'user': UserSerializer(user, context={'request': request}).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            },
            'message': 'Logged in successfully'
        })
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def email_login_request(request):
    """Request email login magic link."""
    email = request.data.get('email', '').strip().lower()
    redirect_to = _resolve_auth_redirect(request.data.get('redirect_to'), '/auth/login')
    
    if not email:
        return Response(
            {'email': 'Email is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        # Create new user if they don't exist (passwordless signup)
        user = User.objects.create_user(
            email=email,
            name=email.split('@')[0].replace('.', ' ').title(),
            is_active=True
        )
    
    # Generate login token
    token = get_random_string(length=64)
    expires_at = timezone.now() + timedelta(minutes=15)  # 15 minute expiry
    
    # Get client info for security
    ip_address = request.META.get('REMOTE_ADDR')
    user_agent = request.META.get('HTTP_USER_AGENT', '')[:255]
    
    EmailLoginToken.objects.create(
        user=user,
        token=token,
        expires_at=expires_at,
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    # Create login link
    login_link = _append_query_params(redirect_to, {'token': token})
    
    # Send email with HTML template
    subject = 'Your Bites n Vibes Login Link'
    html_message = render_to_string('accounts/email_login.html', {
        'user': user,
        'login_link': login_link,
        'expires_minutes': 15,
        'frontend_url': settings.FRONTEND_URL,
    })
    text_message = strip_tags(html_message)
    
    email_msg = EmailMultiAlternatives(
        subject=subject,
        body=text_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[email],
        headers=settings.EMAIL_HEADERS if hasattr(settings, 'EMAIL_HEADERS') else {}
    )
    email_msg.attach_alternative(html_message, "text/html")
    email_msg.send(fail_silently=False)
    
    # Don't reveal if user exists
    return Response({
        'message': 'If the email exists, a login link has been sent to your email'
    })


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def subscribe_newsletter(request):
    """Subscribe to newsletter."""
    email = request.data.get('email', '').strip().lower()
    
    if not email:
        return Response(
            {'error': 'Email is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # If user is authenticated, use their email and update their subscription
    if request.user.is_authenticated:
        user = request.user
        user.newsletter_subscribed = True
        user.save()
        return Response({
            'message': 'Successfully subscribed to newsletter',
            'email': user.email
        }, status=status.HTTP_200_OK)
    
    # If not authenticated, check if user exists with this email
    try:
        user = User.objects.get(email=email)
        user.newsletter_subscribed = True
        user.save()
        return Response({
            'message': 'Successfully subscribed to newsletter',
            'email': email
        }, status=status.HTTP_200_OK)
    except User.DoesNotExist:
        # Create a new user account for newsletter subscription (inactive, no password)
        user = User.objects.create_user(
            email=email,
            name=email.split('@')[0].replace('.', ' ').title(),
            is_active=True,
            newsletter_subscribed=True
        )
        return Response({
            'message': 'Successfully subscribed to newsletter',
            'email': email
        }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def email_login_verify(request):
    """Verify email login token and return JWT tokens."""
    token = request.data.get('token', '').strip()
    
    if not token:
        return Response(
            {'token': 'Token is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        login_token = EmailLoginToken.objects.get(
            token=token,
            used=False,
            expires_at__gt=timezone.now()
        )
        
        user = login_token.user
        
        # Mark token as used
        login_token.used = True
        login_token.save()
        
        # Set a default password if user doesn't have one
        # This allows them to use email/password login next time
        if not user.has_usable_password():
            # Generate a secure random password (12 characters with letters, digits, and special chars)
            import string
            default_password = get_random_string(
                length=12,
                allowed_chars=string.ascii_letters + string.digits + '!@#$%^&*'
            )
            user.set_password(default_password)
            user.save()
        
        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        
        return Response({
            'user': UserSerializer(user, context={'request': request}).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            },
            'message': 'Logged in successfully'
        })
    except EmailLoginToken.DoesNotExist:
        return Response(
            {'token': 'Invalid or expired login link'},
            status=status.HTTP_400_BAD_REQUEST
        )
