from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Notification
from .push import send_push_for_notification


@receiver(post_save, sender=Notification)
def send_notification_push(sender, instance, created, **kwargs):
    if not created:
        return

    try:
        send_push_for_notification(instance)
    except Exception:
        # Push must never block the in-app notification record.
        return
