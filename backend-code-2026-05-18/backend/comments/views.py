from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.db.models import Q
import logging
from kombu.exceptions import OperationalError as KombuOperationalError
from redis.exceptions import ConnectionError as RedisConnectionError
from .models import Comment, CommentAttachment
from .serializers import (
    CommentSerializer, CommentCreateSerializer,
    CommentUpdateSerializer, CommentAttachmentSerializer
)
from listings.models import Listing
from notifications.models import Notification
from notifications.tasks import send_comment_notification

logger = logging.getLogger(__name__)


class CommentViewSet(viewsets.ModelViewSet):
    """ViewSet for Comments with nested replies."""
    queryset = Comment.objects.filter(is_deleted=False).select_related(
        'user', 'listing', 'parent'
    ).prefetch_related('attachments', 'replies')
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    parser_classes = [JSONParser, FormParser, MultiPartParser]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return CommentCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return CommentUpdateSerializer
        return CommentSerializer
    
    def get_serializer_context(self):
        """Add request to serializer context for absolute URLs."""
        context = super().get_serializer_context()
        context['request'] = self.request
        include_replies = self.request.query_params.get('include_replies')
        if include_replies is not None:
            context['include_replies'] = include_replies.lower() != 'false'

        reply_preview_limit = self.request.query_params.get('reply_preview_limit')
        if reply_preview_limit and reply_preview_limit.isdigit():
            context['reply_preview_limit'] = int(reply_preview_limit)
        return context
    
    def get_queryset(self):
        """Filter comments by listing and parent."""
        queryset = super().get_queryset()
        listing_id = self.request.query_params.get('listing')
        parent_id = self.request.query_params.get('parent')
        is_top_level = self.request.query_params.get('top_level', 'false').lower() == 'true'
        
        if listing_id:
            queryset = queryset.filter(listing_id=listing_id)
        
        if parent_id:
            queryset = queryset.filter(parent_id=parent_id)
        elif is_top_level:
            queryset = queryset.filter(parent__isnull=True)
        
        # Order by pinned first, then by created_at
        return queryset.order_by('-is_pinned', '-created_at')
    
    def _create_comment_notification_sync(self, recipient, comment):
        """Create in-app notifications without blocking on external email/broker services."""
        Notification.objects.create(
            user=recipient,
            notification_type='reply' if comment.parent else 'new_comment',
            title=f"New {'reply' if comment.parent else 'comment'} on {comment.listing.name}",
            message=f"{comment.user.name} commented: {comment.message[:100] or 'New attachment'}",
            listing=comment.listing,
            comment=comment,
        )

    def _notify_comment_participants(self, comment):
        """Send notification to listing owners and reply targets."""
        listing = comment.listing
        recipients = {}
        if listing.owner and listing.owner != comment.user:
            recipients[listing.owner.id] = listing.owner

        if comment.parent and comment.parent.user != comment.user:
            recipients[comment.parent.user.id] = comment.parent.user

        for recipient in recipients.values():
            try:
                self._create_comment_notification_sync(recipient, comment)
            except Exception:
                continue

            if not settings.COMMENT_NOTIFICATION_ASYNC:
                continue

            try:
                send_comment_notification.delay(
                    listing_id=listing.id,
                    comment_id=comment.id,
                    recipient_id=recipient.id
                )
            except (KombuOperationalError, RedisConnectionError, ConnectionError, OSError, Exception):
                pass

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = serializer.save()

        uploaded_files = request.FILES.getlist('files')
        for index, uploaded_file in enumerate(uploaded_files[:4]):
            content_type = getattr(uploaded_file, 'content_type', '') or ''
            attachment_type = 'video' if content_type.startswith('video/') else 'image'
            CommentAttachment.objects.create(
                comment=comment,
                attachment_type=attachment_type,
                file=uploaded_file,
                alt_text=request.data.get(f'alt_text_{index}', ''),
                order=index,
            )

        self._notify_comment_participants(comment)
        output = CommentSerializer(comment, context=self.get_serializer_context())
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)
    
    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def add_attachment(self, request, pk=None):
        """Add attachment to a comment."""
        comment = self.get_object()
        
        # Verify user owns the comment
        if comment.user != request.user:
            return Response(
                {'error': 'You can only add attachments to your own comments'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = CommentAttachmentSerializer(
            data=request.data,
            context={'request': request}
        )
        if serializer.is_valid():
            serializer.save(comment=comment)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['delete'], permission_classes=[permissions.IsAuthenticated])
    def soft_delete(self, request, pk=None):
        """Soft delete a comment (mark as deleted)."""
        comment = self.get_object()
        
        # Verify user owns the comment, is listing owner, or is superuser
        is_comment_owner = comment.user == request.user
        is_listing_owner = comment.listing.owner == request.user if comment.listing.owner else False
        is_superuser = request.user.is_superuser
        
        if not (is_comment_owner or is_listing_owner or is_superuser):
            return Response(
                {'error': 'You do not have permission to delete this comment'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        comment.is_deleted = True
        comment.save()
        return Response({'message': 'Comment deleted successfully'})
    
    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def toggle_pin(self, request, pk=None):
        """Pin or unpin a comment (listing owner or superuser can do this)."""
        comment = self.get_object()
        
        # Listing owner or superuser can pin/unpin comments
        is_listing_owner = comment.listing.owner == request.user if comment.listing.owner else False
        is_superuser = request.user.is_superuser
        
        if not (is_listing_owner or is_superuser):
            return Response(
                {'error': 'Only the listing owner or admin can pin/unpin comments'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Only top-level comments can be pinned
        if comment.parent:
            return Response(
                {'error': 'Only top-level comments can be pinned'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Toggle pin status
        comment.is_pinned = not comment.is_pinned
        comment.save()
        
        return Response({
            'message': 'Comment pinned' if comment.is_pinned else 'Comment unpinned',
            'is_pinned': comment.is_pinned
        })
    
    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticatedOrReadOnly])
    def for_listing(self, request):
        """Get all top-level comments for a listing."""
        listing_id = request.query_params.get('listing_id')
        if not listing_id:
            return Response(
                {'error': 'listing_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        listing = get_object_or_404(Listing, id=listing_id)
        comments = Comment.objects.filter(
            listing=listing,
            parent__isnull=True,
            is_deleted=False
        ).select_related('user').prefetch_related('attachments', 'replies').order_by('-is_pinned', '-created_at')
        
        serializer = self.get_serializer(comments, many=True)
        return Response(serializer.data)

