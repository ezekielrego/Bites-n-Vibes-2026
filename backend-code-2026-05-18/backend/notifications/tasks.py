from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth import get_user_model

User = get_user_model()


@shared_task
def send_comment_notification(listing_id, comment_id, recipient_id):
    """Send email when a new comment is posted."""
    from listings.models import Listing
    from comments.models import Comment
    
    try:
        listing = Listing.objects.get(id=listing_id)
        comment = Comment.objects.get(id=comment_id)
        recipient = User.objects.get(id=recipient_id)
        
        # Skip if user disabled email notifications
        if not recipient.email_notifications_enabled:
            return

        # Send email
        if recipient.email:
            send_mail(
                subject=f"New comment on {listing.name} - Bites n Vibes",
                message=f"{comment.user.name} left a {'reply' if comment.parent else 'comment'} on {listing.name}:\n\n{comment.message}\n\nView: {settings.FRONTEND_URL}/listings/{listing.id}",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient.email],
                fail_silently=True,
            )
    except Exception as e:
        print(f"Error sending comment notification: {e}")


@shared_task
def send_listing_notification(listing_id, subscriber_ids):
    """Send notification when a new listing is created."""
    from listings.models import Listing
    
    try:
        listing = Listing.objects.get(id=listing_id)
        subscribers = User.objects.filter(
            id__in=subscriber_ids,
            email_notifications_enabled=True
        )
        
        for subscriber in subscribers:
            # Create notification
            Notification.objects.create(
                user=subscriber,
                notification_type='new_listing',
                title=f"New listing: {listing.name}",
                message=f"Check out {listing.name} in {listing.category.name}!",
                listing=listing
            )
            
            # Send email
            if subscriber.email:
                send_mail(
                    subject=f"New listing: {listing.name} - Bites n Vibes",
                    message=f"Check out the new listing: {listing.name}\n\n{listing.description[:200]}...\n\nView: {settings.FRONTEND_URL}/listings/{listing.id}",
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[subscriber.email],
                    fail_silently=True,
                )
    except Exception as e:
        print(f"Error sending listing notification: {e}")


@shared_task
def send_rating_notification(listing_id, rating_id, recipient_id):
    """Send notification when a new rating is posted."""
    from listings.models import Listing, Rating
    
    try:
        listing = Listing.objects.get(id=listing_id)
        rating = Rating.objects.get(id=rating_id)
        recipient = User.objects.get(id=recipient_id)
        
        # Skip if user disabled email notifications
        if not recipient.email_notifications_enabled:
            return
        
        # Create notification
        Notification.objects.create(
            user=recipient,
            notification_type='rating',
            title=f"New rating on {listing.name}",
            message=f"{rating.user.name} rated {listing.name} {rating.rating} stars",
            listing=listing
        )
        
        # Send email
        if recipient.email:
            send_mail(
                subject=f"New rating on {listing.name} - Bites n Vibes",
                message=f"{rating.user.name} rated {listing.name} {rating.rating} stars.\n\nView: {settings.FRONTEND_URL}/listings/{listing.id}",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient.email],
                fail_silently=True,
            )
    except Exception as e:
        print(f"Error sending rating notification: {e}")

