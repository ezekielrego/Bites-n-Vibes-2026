from django.urls import path
from .views import (
    UserRegistrationView, user_profile, update_profile,
    change_password, password_reset_request, password_reset_confirm,
    auth_encryption_key, encrypted_password_login,
    google_login, google_oauth_url, google_oauth_callback, email_login_request, email_login_verify, email_login_verify_code,
    subscribe_newsletter, app_session, register_push_device, unregister_push_device
)

urlpatterns = [
    path('register/', UserRegistrationView.as_view(), name='register'),
    path('app-session/', app_session, name='app-session'),
    path('encryption-key/', auth_encryption_key, name='auth-encryption-key'),
    path('encrypted-login/', encrypted_password_login, name='encrypted-password-login'),
    path('google/', google_login, name='google-login'),
    path('google/url/', google_oauth_url, name='google-oauth-url'),
    path('google/callback/', google_oauth_callback, name='google-oauth-callback'),
    path('google/complete/', google_oauth_callback, name='google-oauth-complete'),
    path('email-login/', email_login_request, name='email-login-request'),
    path('email-login/verify/', email_login_verify, name='email-login-verify'),
    path('email-login/verify-code/', email_login_verify_code, name='email-login-verify-code'),
    path('profile/', user_profile, name='user-profile'),
    path('profile/update/', update_profile, name='update-profile'),
    path('change-password/', change_password, name='change-password'),
    path('password-reset/', password_reset_request, name='password-reset-request'),
    path('password-reset/confirm/', password_reset_confirm, name='password-reset-confirm'),
    path('push/register/', register_push_device, name='push-register'),
    path('push/unregister/', unregister_push_device, name='push-unregister'),
    path('newsletter/subscribe/', subscribe_newsletter, name='newsletter-subscribe'),
]
