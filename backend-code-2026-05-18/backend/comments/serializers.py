from rest_framework import serializers
from .models import Comment, CommentAttachment
from accounts.serializers import UserSerializer


class CommentAttachmentSerializer(serializers.ModelSerializer):
    """Serializer for CommentAttachment."""
    file_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()
    
    class Meta:
        model = CommentAttachment
        fields = [
            'id', 'attachment_type', 'file', 'file_url', 'thumbnail_url',
            'url', 'link_title', 'link_description', 'link_image',
            'alt_text', 'order', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']
    
    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    def get_thumbnail_url(self, obj):
        # Check if thumbnail field exists and has a value
        if hasattr(obj, 'thumbnail') and obj.thumbnail:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.thumbnail.url)
            return obj.thumbnail.url
        return None


class CommentSerializer(serializers.ModelSerializer):
    """Serializer for Comment with nested replies."""
    user = UserSerializer(read_only=True)
    user_id = serializers.IntegerField(write_only=True, required=False)
    replies = serializers.SerializerMethodField()
    attachments = CommentAttachmentSerializer(many=True, read_only=True)
    depth = serializers.ReadOnlyField()
    reply_count = serializers.ReadOnlyField()
    parent_id = serializers.SerializerMethodField()
    parent_author = serializers.SerializerMethodField()
    
    class Meta:
        model = Comment
        fields = [
            'id', 'listing', 'user', 'user_id', 'parent', 'parent_id', 'parent_author', 'message', 'role',
            'replies', 'attachments', 'is_edited', 'is_deleted', 'is_pinned',
            'depth', 'reply_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'is_edited', 'is_deleted', 'is_pinned', 'created_at', 'updated_at']
        extra_kwargs = {
            'listing': {'write_only': True},
        }
    
    def get_parent_id(self, obj):
        """Get parent comment ID if this is a reply."""
        return str(obj.parent.id) if obj.parent else None
    
    def get_parent_author(self, obj):
        """Get parent comment author name if this is a reply."""
        return obj.parent.user.name if obj.parent and obj.parent.user else None
    
    def get_replies(self, obj):
        """Get nested replies for this comment."""
        if self.context.get('include_replies', True):
            replies = obj.replies.filter(is_deleted=False).select_related('user', 'parent__user').prefetch_related('attachments')
            reply_preview_limit = self.context.get('reply_preview_limit')
            if isinstance(reply_preview_limit, int) and reply_preview_limit >= 0:
                replies = replies[:reply_preview_limit]
            return CommentSerializer(replies, many=True, context=self.context).data
        return []
    
    def create(self, validated_data):
        """Create comment with user from request."""
        validated_data.pop('user_id', None)
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class CommentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating comments."""
    attachments = CommentAttachmentSerializer(many=True, required=False, read_only=True)
    
    class Meta:
        model = Comment
        fields = ['id', 'listing', 'parent', 'message', 'role', 'attachments']
        read_only_fields = ['id']
    
    def validate_message(self, value):
        """Validate message."""
        if value:
            return value.strip()
        return ""

    def validate(self, attrs):
        request = self.context.get('request')
        message = (attrs.get('message') or '').strip()
        files = request.FILES.getlist('files') if request else []
        parent = attrs.get('parent')
        listing = attrs.get('listing')

        if not message and not files:
            raise serializers.ValidationError('Add a message or at least one attachment before sending.')

        if parent and listing and parent.listing_id != listing.id:
            raise serializers.ValidationError('Replies must belong to the same listing thread.')

        if parent and parent.is_deleted:
            raise serializers.ValidationError('You cannot reply to a deleted comment.')

        attrs['message'] = message
        return attrs
    
    def create(self, validated_data):
        """Create comment with attachments."""
        # Note: Attachments should be added via the add_attachment endpoint after comment creation
        validated_data['user'] = self.context['request'].user
        comment = Comment.objects.create(**validated_data)
        return comment


class CommentUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating comments."""
    class Meta:
        model = Comment
        fields = ['message', 'role']
    
    def update(self, instance, validated_data):
        """Update comment and mark as edited."""
        validated_data['is_edited'] = True
        return super().update(instance, validated_data)

