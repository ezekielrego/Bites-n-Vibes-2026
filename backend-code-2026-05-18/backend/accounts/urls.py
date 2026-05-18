from django.urls import path
from .views import (
    UserRegistrationView, user_profile, update_profile,
    change_password, password_reset_request, password_reset_confirm,
    google_login, google_oauth_url, google_oauth_callback, email_login_request, email_login_verify,
    subscribe_newsletter, app_session
)

urlpatterns = [
    path('register/', UserRegistrationView.as_view(), name='register'),
    path('app-session/', app_session, name='app-session'),
    path('google/', google_login, name='google-login'),
    path('google/url/', google_oauth_url, name='google-oauth-url'),
    path('google/callback/', google_oauth_callback, name='google-oauth-callback'),
    path('google/complete/', google_oauth_callback, name='google-oauth-complete'),
    path('email-login/', email_login_request, name='email-login-request'),
    path('email-login/verify/', email_login_verify, name='email-login-verify'),
    path('profile/', user_profile, name='user-profile'),
    path('profile/update/', update_profile, name='update-profile'),
    path('change-password/', change_password, name='change-password'),
    path('password-reset/', password_reset_request, name='password-reset-request'),
    path('password-reset/confirm/', password_reset_confirm, name='password-reset-confirm'),
    path('newsletter/subscribe/', subscribe_newsletter, name='newsletter-subscribe'),
]
