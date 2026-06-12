from django.db import models
from django.conf import settings
from django.core.validators import FileExtensionValidator, MaxValueValidator
from django.core.exceptions import ValidationError


class Comment(models.Model):
    """Nested comments for listings with replies."""
    listing = models.ForeignKey('listings.Listing', on_delete=models.CASCADE, 
                               related_name='comments')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                            related_name='comments')
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True,
                              related_name='replies')
    root_parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True,
                                   related_name='thread_replies',
                                   help_text="The top-level comment this belongs to.")
    
    message = models.TextField(blank=True)
    role = models.CharField(max_length=50, blank=True, 
                           help_text="e.g., 'Foodie', 'Host', 'Admin'")
    
    # Metadata
    is_edited = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    is_pinned = models.BooleanField(default=False, help_text="Pinned comments appear at the top")
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'comments'
        ordering = ['-is_pinned', '-created_at']  # Pinned comments first
        indexes = [
            models.Index(fields=['listing', 'parent', 'created_at']),
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['listing', 'is_pinned']),
        ]
    
    def __str__(self):
        return f"{self.user.email} - {self.listing.name} - {self.message[:50]}"
    
    def save(self, *args, **kwargs):
        # Calculate root_parent
        if self.parent:
            # If parent has a root_parent, use it
            if self.parent.root_parent:
                self.root_parent = self.parent.root_parent
            # Otherwise, parent IS the root_parent
            else:
                self.root_parent = self.parent
        else:
            # If no parent, this is a root comment
            self.root_parent = None
            
        super().save(*args, **kwargs)
    
    @property
    def depth(self):
        """Calculate comment depth in thread."""
        depth = 0
        parent = self.parent
        while parent:
            depth += 1
            parent = parent.parent
            if depth > 10:  # Prevent infinite loops
                break
        return depth
    
    @property
    def reply_count(self):
        """Count direct replies."""
        return self.replies.filter(is_deleted=False).count()


class CommentFeedback(models.Model):
    """Useful / not useful feedback for comments."""
    VOTE_USEFUL = 'useful'
    VOTE_NOT_USEFUL = 'not_useful'
    VOTE_CHOICES = [
        (VOTE_USEFUL, 'Useful'),
        (VOTE_NOT_USEFUL, 'Not useful'),
    ]

    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name='feedbacks')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='comment_feedbacks')
    vote = models.CharField(max_length=16, choices=VOTE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'comment_feedbacks'
        unique_together = ('comment', 'user')
        indexes = [
            models.Index(fields=['comment', 'vote']),
            models.Index(fields=['user', 'updated_at']),
        ]

    def __str__(self):
        return f"{self.user_id} {self.vote} comment {self.comment_id}"


# File size validator for comment attachments (20MB max)
def validate_comment_file_size(value):
    max_size = 20 * 1024 * 1024  # 20MB
    if value.size > max_size:
        raise ValidationError(f'File size must be less than 20MB. Current size: {value.size / (1024*1024):.1f}MB')


class CommentAttachment(models.Model):
    """Media attachments for comments."""
    ATTACHMENT_TYPES = [
        ('image', 'Image'),
        ('video', 'Video'),
        ('link', 'Link'),
    ]
    
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, 
                               related_name='attachments')
    attachment_type = models.CharField(max_length=10, choices=ATTACHMENT_TYPES)
    
    # For files (images/videos) - 20MB max
    file = models.FileField(
        upload_to='comment_attachments/',
        blank=True,
        null=True,
        validators=[
            FileExtensionValidator(
                allowed_extensions=['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm']
            ),
            validate_comment_file_size
        ]
    )
    
    # For links
    url = models.URLField(blank=True, null=True)
    link_title = models.CharField(max_length=255, blank=True)
    link_description = models.TextField(blank=True)
    link_image = models.URLField(blank=True, null=True)
    
    # Metadata
    thumbnail = models.ImageField(upload_to='comment_thumbnails/', blank=True, null=True)
    alt_text = models.CharField(max_length=255, blank=True)
    order = models.IntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'comment_attachments'
        ordering = ['order', 'created_at']
        indexes = [
            models.Index(fields=['comment', 'attachment_type']),
        ]
    
    def __str__(self):
        return f"{self.comment.id} - {self.get_attachment_type_display()}"

