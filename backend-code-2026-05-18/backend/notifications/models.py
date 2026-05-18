from django.db import models
from django.conf import settings


class Notification(models.Model):
    """User notifications."""
    NOTIFICATION_TYPES = [
        ('new_listing', 'New Listing'),
        ('new_comment', 'New Comment'),
        ('reply', 'Reply to Comment'),
        ('rating', 'New Rating'),
        ('booking', 'Booking Update'),
        ('ticket', 'Ticket Update'),
        ('event', 'Event Update'),
        ('system', 'System Notification'),
    ]
    
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                            related_name='notifications')
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=255)
    message = models.TextField()
    
    # Related objects (optional)
    listing = models.ForeignKey('listings.Listing', on_delete=models.CASCADE,
                               null=True, blank=True, related_name='notifications')
    comment = models.ForeignKey('comments.Comment', on_delete=models.CASCADE,
                               null=True, blank=True, related_name='notifications')
    
    # Status
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read', 'created_at']),
            models.Index(fields=['user', 'notification_type']),
        ]
    
    def __str__(self):
        return f"{self.user.email} - {self.get_notification_type_display()} - {self.title}"
    
    def mark_as_read(self):
        """Mark notification as read."""
        from django.utils import timezone
        self.is_read = True
        self.read_at = timezone.now()
        self.save()

