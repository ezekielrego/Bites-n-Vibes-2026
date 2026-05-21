"""
URL configuration for bitesweb project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from .legal_views import legal_page
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)

urlpatterns = [
    path('manage/', admin.site.urls),
    path('terms/', legal_page, {'page': 'terms'}, name='terms'),
    path('privacy/', legal_page, {'page': 'privacy'}, name='privacy'),
    
    # JWT Authentication
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/token/verify/', TokenVerifyView.as_view(), name='token_verify'),
    
    # Custom auth URLs (must come before allauth to override callback)
    path('api/auth/', include('accounts.urls')),
    
    # Django Allauth (Google OAuth) - after custom URLs
    path('api/auth/', include('allauth.urls')),
    
    # Other apps
    path('api/listings/', include('listings.urls')),
    path('api/comments/', include('comments.urls')),
    path('api/notifications/', include('notifications.urls')),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]

# Serve static files in development
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

