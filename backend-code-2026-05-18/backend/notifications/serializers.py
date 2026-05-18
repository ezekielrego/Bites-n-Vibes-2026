from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    """Serializer for Notification."""
    listing_name = serializers.CharField(source='listing.name', read_only=True, allow_null=True)
    listing_id = serializers.IntegerField(source='listing.id', read_only=True, allow_null=True)
    
    class Meta:
        model = Notification
        fields = [
            'id', 'notification_type', 'title', 'message',
            'listing_id', 'listing_name', 'comment',
            'is_read', 'read_at', 'created_at'
        ]
        read_only_fields = ['id', 'created_at', 'read_at']

