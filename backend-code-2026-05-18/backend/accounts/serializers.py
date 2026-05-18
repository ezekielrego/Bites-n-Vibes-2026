from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User, PasswordResetToken


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model."""
    display_avatar = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'avatar', 'avatar_url', 'display_avatar', 
                  'phone', 'email_notifications_enabled', 'push_notifications_enabled',
                  'date_joined', 'last_login', 'is_superuser', 'is_staff']
        read_only_fields = ['id', 'date_joined', 'last_login', 'display_avatar', 'is_superuser', 'is_staff']
        extra_kwargs = {
            'password': {'write_only': True},
        }
    
    def get_display_avatar(self, obj):
        """Get display avatar URL - return full URL if it's a relative path."""
        avatar = obj.display_avatar
        if not avatar:
            return None
        # If it's already a full URL, return as is
        if avatar.startswith('http://') or avatar.startswith('https://'):
            return avatar
        # If it's a relative path, build absolute URI
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(avatar)
        # Fallback: return as is (will be handled by frontend)
        return avatar


class UserRegistrationSerializer(serializers.ModelSerializer):
    """Serializer for user registration."""
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True)
    
    class Meta:
        model = User
        fields = ['email', 'name', 'password', 'password2', 'phone']
        extra_kwargs = {
            'name': {'required': True},
        }
    
    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        return attrs
    
    def create(self, validated_data):
        validated_data.pop('password2')
        user = User.objects.create_user(**validated_data)
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    """Serializer for password reset request."""
    email = serializers.EmailField(required=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Serializer for password reset confirmation."""
    token = serializers.CharField(required=True)
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True)
    
    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        return attrs


class PasswordChangeSerializer(serializers.Serializer):
    """Serializer for password change."""
    old_password = serializers.CharField(required=False, allow_blank=True, allow_null=True)  # Make optional for initial password set
    new_password = serializers.CharField(required=True, validators=[validate_password])
    new_password2 = serializers.CharField(required=True)
    
    def validate_old_password(self, value):
        # Allow None or empty string for initial password set
        if value is None or value == '':
            return None
        return value
    
    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password2']:
            raise serializers.ValidationError({"new_password": "Password fields didn't match."})
        return attrs


class SetPasswordSerializer(serializers.Serializer):
    """Serializer for setting initial password (when user doesn't have one)."""
    password = serializers.CharField(required=True, validators=[validate_password])
    password2 = serializers.CharField(required=True)
    
    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        return attrs
