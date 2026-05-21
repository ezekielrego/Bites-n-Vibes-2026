import json

from django.conf import settings

from accounts.models import PushDevice


_firebase_initialized = False


def send_push_for_notification(notification):
    """Send a Firebase push for an in-app notification when configured."""
    user = notification.user
    if not getattr(user, 'push_notifications_enabled', False):
        return {'sent': 0, 'skipped': 'user-disabled'}

    devices = list(
        user.push_devices.filter(
            is_active=True,
            provider='firebase',
        )
    )
    if not devices:
        return {'sent': 0, 'skipped': 'no-devices'}

    if not settings.FIREBASE_PUSH_ENABLED:
        return {'sent': 0, 'skipped': 'firebase-disabled'}

    firebase = _load_firebase()
    if not firebase:
        return {'sent': 0, 'skipped': 'firebase-unavailable'}

    messaging = firebase['messaging']
    sent = 0
    for device in devices:
        message = messaging.Message(
            token=device.token,
            notification=messaging.Notification(
                title=notification.title,
                body=notification.message,
            ),
            data={
                'notification_id': str(notification.id),
                'type': notification.notification_type,
                'listing_id': str(notification.listing_id or ''),
            },
            android=messaging.AndroidConfig(
                priority='high',
                notification=messaging.AndroidNotification(
                    channel_id='default',
                    color='#FF6B3D',
                    sound='default',
                ),
            ),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(sound='default', badge=1),
                ),
            ),
        )
        try:
            messaging.send(message, dry_run=settings.FIREBASE_PUSH_DRY_RUN)
            sent += 1
            if device.failure_count or device.last_error:
                device.failure_count = 0
                device.last_error = ''
                device.save(update_fields=['failure_count', 'last_error', 'updated_at'])
        except Exception as exc:
            device.failure_count += 1
            device.last_error = str(exc)[:255]
            if device.failure_count >= 5:
                device.is_active = False
            device.save(update_fields=['failure_count', 'last_error', 'is_active', 'updated_at'])

    return {'sent': sent}


def _load_firebase():
    global _firebase_initialized
    try:
        import firebase_admin
        from firebase_admin import credentials, messaging
    except Exception:
        return None

    if not _firebase_initialized:
        credential = None
        if settings.FIREBASE_CREDENTIALS_JSON:
            credential = credentials.Certificate(json.loads(settings.FIREBASE_CREDENTIALS_JSON))
        elif settings.FIREBASE_CREDENTIALS_PATH:
            credential = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)

        if not credential:
            return None

        if not firebase_admin._apps:
            firebase_admin.initialize_app(credential)
        _firebase_initialized = True

    return {'messaging': messaging}
