from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, PasswordResetToken, EmailLoginToken, PushDevice


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Admin configuration for User model."""
    list_display = ['email', 'name', 'is_active', 'is_staff', 'date_joined']
    list_filter = ['is_active', 'is_staff', 'is_superuser', 'date_joined']
    search_fields = ['email', 'name']
    ordering = ['-date_joined']
    
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal Info', {'fields': ('name', 'avatar', 'avatar_url', 'phone')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Notifications', {'fields': ('email_notifications_enabled', 'push_notifications_enabled')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'name', 'password1', 'password2', 'is_staff', 'is_superuser'),
        }),
    )


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    """Admin configuration for PasswordResetToken model."""
    list_display = ['user', 'created_at', 'expires_at', 'used']
    list_filter = ['used', 'created_at']
    search_fields = ['user__email', 'token']
    readonly_fields = ['token', 'created_at']


@admin.register(EmailLoginToken)
class EmailLoginTokenAdmin(admin.ModelAdmin):
    """Admin configuration for EmailLoginToken model."""
    list_display = ['user', 'created_at', 'expires_at', 'used', 'ip_address']
    list_filter = ['used', 'created_at']
    search_fields = ['user__email', 'token', 'ip_address']
    readonly_fields = ['token', 'created_at', 'ip_address', 'user_agent']


@admin.register(PushDevice)
class PushDeviceAdmin(admin.ModelAdmin):
    list_display = ['user', 'platform', 'provider', 'is_active', 'failure_count', 'last_registered_at']
    list_filter = ['platform', 'provider', 'is_active', 'last_registered_at']
    search_fields = ['user__email', 'token', 'device_name', 'last_error']
    readonly_fields = ['created_at', 'updated_at', 'last_registered_at', 'last_error', 'failure_count']

