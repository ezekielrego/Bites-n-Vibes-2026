from django.core.management.base import BaseCommand

from listings.models import ListingMediaPolicy


class Command(BaseCommand):
    help = 'Remove listing videos that are older than the admin-configured retention window.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Run cleanup even if the normal cleanup interval has not elapsed yet.',
        )

    def handle(self, *args, **options):
        policy = ListingMediaPolicy.get_solo()
        deleted_count = policy.cleanup_expired_videos(force=bool(options.get('force')))

        self.stdout.write(
            self.style.SUCCESS(
                f'Removed {deleted_count} expired listing video{"s" if deleted_count != 1 else ""}.'
            )
        )
