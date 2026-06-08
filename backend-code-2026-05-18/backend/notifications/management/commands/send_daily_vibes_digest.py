from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Count
from django.utils import timezone

from listings.models import Listing
from notifications.models import Notification


class Command(BaseCommand):
    help = 'Send one daily Checkout new vibes notification when new listings exist.'

    def add_arguments(self, parser):
        parser.add_argument('--hours', type=int, default=24)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        hours = max(int(options['hours'] or 24), 1)
        dry_run = bool(options['dry_run'])
        now = timezone.now()
        window_start = now - timedelta(hours=hours)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        new_listings = (
            Listing.objects.filter(is_active=True, created_at__gte=window_start)
            .select_related('category', 'owner')
            .prefetch_related('ratings', 'saved_by', 'tickets', 'comments', 'images')
        )
        new_count = new_listings.count()
        if new_count == 0:
            self.stdout.write(self.style.SUCCESS('No new vibes found. Nothing sent.'))
            return

        main_listing = self._select_main_listing(new_listings)
        if not main_listing:
            self.stdout.write(self.style.SUCCESS('No active main listing found. Nothing sent.'))
            return

        title = 'Checkout new vibes'
        message = self._build_message(main_listing, new_count)
        User = get_user_model()
        recipients = (
            User.objects.filter(is_active=True, push_notifications_enabled=True)
            .exclude(id=main_listing.owner_id)
            .filter(push_devices__is_active=True)
            .distinct()
        )

        sent = 0
        skipped = 0
        for user in recipients:
            already_sent_today = Notification.objects.filter(
                user=user,
                notification_type='new_listing',
                title=title,
                created_at__gte=today_start,
            ).exists()
            if already_sent_today:
                skipped += 1
                continue

            sent += 1
            if dry_run:
                continue

            Notification.objects.create(
                user=user,
                notification_type='new_listing',
                title=title,
                message=message,
                listing=main_listing,
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Daily vibes digest complete. new_listings={new_count}, sent={sent}, skipped={skipped}, dry_run={dry_run}'
            )
        )

    def _select_main_listing(self, queryset):
        return (
            queryset.annotate(
                recent_rating_count=Count('ratings', distinct=True),
                recent_save_count=Count('saved_by', distinct=True),
                recent_ticket_count=Count('tickets', distinct=True),
                recent_comment_count=Count('comments', distinct=True),
            )
            .order_by(
                '-is_featured',
                '-is_trending',
                '-is_verified',
                '-recent_ticket_count',
                '-recent_save_count',
                '-recent_rating_count',
                '-recent_comment_count',
                '-created_at',
            )
            .first()
        )

    def _build_message(self, listing, new_count):
        if new_count == 1:
            return f'{listing.name} just landed. Take a look when you have a moment.'
        return f'{listing.name} and {new_count - 1} more new vibe{"s" if new_count - 1 != 1 else ""} just landed.'
