from django.contrib import admin
from .models import Comment, CommentAttachment, CommentFeedback


class CommentAttachmentInline(admin.TabularInline):
    """Inline admin for comment attachments."""
    model = CommentAttachment
    extra = 0
    fields = ['attachment_type', 'file', 'url', 'order']


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    """Admin configuration for Comment."""
    list_display = ['id', 'listing', 'user', 'parent', 'message_preview', 
                   'role', 'is_deleted', 'created_at']
    list_filter = ['is_deleted', 'is_edited', 'created_at', 'listing']
    search_fields = ['message', 'user__email', 'listing__name']
    readonly_fields = ['depth', 'reply_count', 'created_at', 'updated_at']
    inlines = [CommentAttachmentInline]
    raw_id_fields = ['listing', 'user', 'parent']
    
    fieldsets = (
        ('Content', {
            'fields': ('listing', 'user', 'parent', 'message', 'role')
        }),
        ('Status', {
            'fields': ('is_edited', 'is_deleted', 'deleted_at')
        }),
        ('Statistics', {
            'fields': ('depth', 'reply_count')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )
    
    def message_preview(self, obj):
        return obj.message[:50] + '...' if len(obj.message) > 50 else obj.message
    message_preview.short_description = 'Message'


@admin.register(CommentAttachment)
class CommentAttachmentAdmin(admin.ModelAdmin):
    """Admin configuration for CommentAttachment."""
    list_display = ['comment', 'attachment_type', 'file', 'url', 'order', 'created_at']
    list_filter = ['attachment_type', 'created_at']
    search_fields = ['comment__message']
    raw_id_fields = ['comment']


@admin.register(CommentFeedback)
class CommentFeedbackAdmin(admin.ModelAdmin):
    """Admin configuration for comment useful/not useful feedback."""
    list_display = ['comment', 'user', 'vote', 'created_at', 'updated_at']
    list_filter = ['vote', 'created_at']
    search_fields = ['comment__message', 'user__email', 'user__name']
    raw_id_fields = ['comment', 'user']

