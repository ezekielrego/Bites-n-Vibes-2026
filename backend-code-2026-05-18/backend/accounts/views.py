from rest_framework import generics, status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
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
import base64
import json
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .models import PasswordResetToken, EmailLoginToken, PushDevice
from .serializers import (
    UserSerializer, UserRegistrationSerializer,
    PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
    PasswordChangeSerializer, SetPasswordSerializer
)

User = get_user_model()
LOGIN_CODE_ALLOWED_CHARS = '0123456789'


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


def _create_email_login_code(user, request):
    EmailLoginToken.objects.filter(
        user=user,
        used=False,
        expires_at__gt=timezone.now(),
    ).update(used=True)

    for _ in range(8):
        code = get_random_string(length=6, allowed_chars=LOGIN_CODE_ALLOWED_CHARS)
        if not EmailLoginToken.objects.filter(token=code, used=False, expires_at__gt=timezone.now()).exists():
            break
    else:
        code = get_random_string(length=8, allowed_chars=LOGIN_CODE_ALLOWED_CHARS)

    ip_address = request.META.get('REMOTE_ADDR')
    user_agent = request.META.get('HTTP_USER_AGENT', '')[:255]
    EmailLoginToken.objects.create(
        user=user,
        token=code,
        expires_at=timezone.now() + timedelta(minutes=10),
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return code


def _issue_auth_response(user, request, message='Logged in successfully'):
    if not user.has_usable_password():
        import string
        default_password = get_random_string(
            length=12,
            allowed_chars=string.ascii_letters + string.digits + '!@#$%^&*',
        )
        user.set_password(default_password)
        user.save()

    refresh = RefreshToken.for_user(user)
    return Response({
        'user': UserSerializer(user, context={'request': request}).data,
        'tokens': {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        },
        'message': message,
    })


def _load_auth_private_key():
    private_key_pem = getattr(settings, 'AUTH_ENCRYPTION_PRIVATE_KEY', '')
    if not private_key_pem:
        return None
    return serialization.load_pem_private_key(
        private_key_pem.encode('utf-8'),
        password=None,
    )


def _auth_public_key_response():
    private_key = _load_auth_private_key()
    if not private_key:
        return None
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode('utf-8')
    return {
        'key_id': getattr(settings, 'AUTH_ENCRYPTION_KEY_ID', 'auth-rsa-v1'),
        'algorithm': 'RSA-OAEP-256/AES-256-GCM',
        'public_key': public_pem,
    }


def _decrypt_auth_payload(request):
    encrypted_key = (request.data.get('encrypted_key') or '').strip()
    iv = (request.data.get('iv') or '').strip()
    ciphertext = (request.data.get('ciphertext') or '').strip()
    tag = (request.data.get('tag') or '').strip()
    encrypted_payload = (request.data.get('encrypted_payload') or '').strip()

    if not encrypted_payload and not (encrypted_key and iv and ciphertext and tag):
        return None

    request_key_id = (request.data.get('key_id') or '').strip()
    expected_key_id = getattr(settings, 'AUTH_ENCRYPTION_KEY_ID', 'auth-rsa-v1')
    if request_key_id and request_key_id != expected_key_id:
        raise ValueError('Unsupported encryption key')

    private_key = _load_auth_private_key()
    if not private_key:
        raise ValueError('Login encryption is not configured')

    if encrypted_key:
        aes_key = private_key.decrypt(
            base64.b64decode(encrypted_key),
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None,
            ),
        )
        decrypted = AESGCM(aes_key).decrypt(
            base64.b64decode(iv),
            base64.b64decode(ciphertext) + base64.b64decode(tag),
            None,
        )
    else:
        decrypted = private_key.decrypt(
            base64.b64decode(encrypted_payload),
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None,
            ),
        )
    payload = json.loads(decrypted.decode('utf-8'))
    if not isinstance(payload, dict):
        raise ValueError('Invalid encrypted login payload')
    return payload


def _auth_request_data(request):
    payload = _decrypt_auth_payload(request)
    return payload if payload is not None else request.data


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


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def auth_encryption_key(request):
    """Return the public key used by the app to encrypt login payloads."""
    payload = _auth_public_key_response()
    if not payload:
        return Response(
            {'detail': 'Login encryption is not configured.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return Response(payload, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def encrypted_password_login(request):
    """Decrypt and process email/password login."""
    try:
        payload = _decrypt_auth_payload(request)
    except Exception:
        return Response(
            {'detail': 'Encrypted login payload could not be read.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    email = (payload or {}).get('email', '').strip().lower()
    password = (payload or {}).get('password', '')
    if not email or not password:
        return Response(
            {'detail': 'Email and password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(request, username=email, password=password)
    if not user:
        return Response(
            {'detail': 'Email or password is incorrect.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    if not user.is_active:
        return Response(
            {'detail': 'This account is disabled.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    return _issue_auth_response(user, request)


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
        redirect_to = _resolve_auth_redirect(request.data.get('redirect_to'), '/auth/reset')
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
            
            reset_link = _append_query_params(redirect_to, {'token': token})

            html_message = f"""
                <html>
                  <body style="font-family: Arial, sans-serif; background: #0b0f17; color: #f7f8fb; padding: 24px;">
                    <div style="max-width: 520px; margin: 0 auto; background: #111827; border-radius: 18px; padding: 28px; border: 1px solid rgba(255,255,255,0.08);">
                      <p style="margin: 0 0 16px; color: #a7b0c2;">Bites &amp; Vibes</p>
                      <h1 style="margin: 0 0 12px; font-size: 24px; color: #ffffff;">Reset your password</h1>
                      <p style="margin: 0 0 18px; line-height: 1.6; color: #d7dce7;">
                        Tap the button below to choose a new password. This link stays active for 24 hours.
                      </p>
                      <p style="margin: 24px 0;">
                        <a href="{reset_link}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #ff6b3d; color: #ffffff; text-decoration: none; font-weight: 700;">
                          Reset password
                        </a>
                      </p>
                      <p style="margin: 0; line-height: 1.6; color: #a7b0c2;">
                        If you did not request this, you can ignore this email.
                      </p>
                    </div>
                  </body>
                </html>
            """
            text_message = (
                'Reset your Bites & Vibes password with this link:\n'
                f'{reset_link}\n\n'
                'If you did not request this, you can ignore this email.'
            )

            email_msg = EmailMultiAlternatives(
                subject='Password Reset Request - Bites n Vibes',
                body=text_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[email],
                headers=settings.EMAIL_HEADERS if hasattr(settings, 'EMAIL_HEADERS') else {},
            )
            email_msg.attach_alternative(html_message, "text/html")
            email_msg.send(fail_silently=False)
            
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


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def register_push_device(request):
    """Register or refresh a push-capable device token for the current user."""
    token = (request.data.get('token') or '').strip()
    platform = (request.data.get('platform') or 'unknown').strip().lower()
    provider = (request.data.get('provider') or 'firebase').strip().lower()
    device_name = (request.data.get('device_name') or '').strip()

    if not token:
        return Response(
            {'token': 'Push token is required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if platform not in {'android', 'ios', 'web'}:
        platform = 'unknown'
    if provider not in {'firebase', 'expo'}:
        provider = 'firebase'

    device, _ = PushDevice.objects.update_or_create(
        token=token,
        defaults={
            'user': request.user,
            'platform': platform,
            'provider': provider,
            'device_name': device_name[:120],
            'is_active': True,
            'failure_count': 0,
            'last_error': '',
        },
    )

    return Response(
        {
            'id': device.id,
            'message': 'Push device registered successfully',
            'push_notifications_enabled': request.user.push_notifications_enabled,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def unregister_push_device(request):
    """Deactivate one push device token, or all user devices when omitted."""
    token = (request.data.get('token') or '').strip()
    queryset = PushDevice.objects.filter(user=request.user, is_active=True)

    if token:
        queryset = queryset.filter(token=token)

    count = queryset.update(is_active=False)

    return Response(
        {
            'message': f'{count} push device{"s" if count != 1 else ""} removed',
        },
        status=status.HTTP_200_OK,
    )


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
    from requests import RequestException
    
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
        try:
            token_response = requests.post(
                'https://oauth2.googleapis.com/token',
                data={
                    'code': code,
                    'client_id': client_id,
                    'client_secret': client_secret,
                    'redirect_uri': redirect_uri,
                    'grant_type': 'authorization_code',
                },
                timeout=12,
            )
        except RequestException as exc:
            return _redirect_to_auth_target(
                _append_query_params(
                    redirect_to,
                    {
                        'error': 'token_exchange_unreachable',
                        'detail': str(exc)[:100],
                    },
                )
            )
        
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
        try:
            user_response = requests.get(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                headers={'Authorization': f'Bearer {access_token}'},
                timeout=12,
            )
        except RequestException as exc:
            return _redirect_to_auth_target(
                _append_query_params(
                    redirect_to,
                    {
                        'error': 'user_info_unreachable',
                        'detail': str(exc)[:100],
                    },
                )
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
    """Request email login code."""
    try:
        payload = _auth_request_data(request)
    except Exception:
        return Response(
            {'detail': 'Encrypted login payload could not be read.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    email = payload.get('email', '').strip().lower()
    redirect_to = _resolve_auth_redirect(payload.get('redirect_to'), '/auth/login')
    
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
    
    code = _create_email_login_code(user, request)
    login_link = _append_query_params(redirect_to, {'code': code, 'email': email})

    subject = 'Your Bites n Vibes login code'
    html_message = f"""
        <html>
          <body style="font-family: Arial, sans-serif; background: #0b0f17; color: #f7f8fb; padding: 24px;">
            <div style="max-width: 520px; margin: 0 auto; background: #111827; border-radius: 18px; padding: 28px; border: 1px solid rgba(255,255,255,0.08);">
              <p style="margin: 0 0 16px; color: #a7b0c2;">Bites &amp; Vibes</p>
              <h1 style="margin: 0 0 12px; font-size: 24px; color: #ffffff;">Your login code</h1>
              <p style="margin: 0 0 18px; line-height: 1.6; color: #d7dce7;">
                Enter this code in the app to sign in. It expires in 10 minutes.
              </p>
              <p style="margin: 24px 0; font-size: 34px; letter-spacing: 8px; font-weight: 800; color: #ffffff;">
                {code}
              </p>
              <p style="margin: 0 0 18px; line-height: 1.6; color: #a7b0c2;">
                If the app also opens this link, you can continue there: <a href="{login_link}" style="color: #ff6b3d;">Open Bites &amp; Vibes</a>
              </p>
              <p style="margin: 0; line-height: 1.6; color: #a7b0c2;">
                If you did not request this, you can ignore this email.
              </p>
            </div>
          </body>
        </html>
    """
    text_message = (
        f'Your Bites & Vibes login code is {code}.\n'
        'Enter it in the app within 10 minutes.\n\n'
        f'App link: {login_link}\n\n'
        'If you did not request this, you can ignore this email.'
    )
    
    email_msg = EmailMultiAlternatives(
        subject=subject,
        body=text_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[email],
        headers=settings.EMAIL_HEADERS if hasattr(settings, 'EMAIL_HEADERS') else {}
    )
    email_msg.attach_alternative(html_message, "text/html")
    email_msg.send(fail_silently=False)
    
    return Response({
        'message': 'Enter the 6-digit code sent to your email.'
    })


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def email_login_verify_code(request):
    """Verify email login code and return JWT tokens."""
    try:
        payload = _auth_request_data(request)
    except Exception:
        return Response(
            {'detail': 'Encrypted login payload could not be read.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    email = payload.get('email', '').strip().lower()
    code = ''.join(char for char in payload.get('code', '').strip() if char.isdigit())

    if not email:
        return Response(
            {'email': 'Email is required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if len(code) < 6:
        return Response(
            {'code': 'Enter the 6-digit code'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        login_token = EmailLoginToken.objects.select_related('user').get(
            user__email=email,
            token=code,
            used=False,
            expires_at__gt=timezone.now()
        )

        login_token.used = True
        login_token.save(update_fields=['used'])
        return _issue_auth_response(login_token.user, request)
    except EmailLoginToken.DoesNotExist:
        return Response(
            {'code': 'Invalid or expired login code'},
            status=status.HTTP_400_BAD_REQUEST
        )


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
        login_token.save(update_fields=['used'])
        return _issue_auth_response(user, request)
    except EmailLoginToken.DoesNotExist:
        return Response(
            {'token': 'Invalid or expired login link'},
            status=status.HTTP_400_BAD_REQUEST
        )
