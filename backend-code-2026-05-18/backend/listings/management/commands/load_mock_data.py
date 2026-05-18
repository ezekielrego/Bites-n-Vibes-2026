from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Backward-compatible wrapper for the current app/backend sync seed command.'

    def handle(self, *args, **options):
        self.stdout.write('Delegating to seed_app_sync_data...')
        call_command('seed_app_sync_data')
