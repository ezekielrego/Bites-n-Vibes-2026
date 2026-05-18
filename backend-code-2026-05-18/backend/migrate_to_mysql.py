#!/usr/bin/env python
"""
Script to migrate data from SQLite to MySQL
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bitesweb.settings')
django.setup()

from django.conf import settings
from django.core.management import call_command
from django.db import connections
import json

# Temporarily switch to SQLite to export data
print("Step 1: Exporting data from SQLite...")
settings.DATABASES['sqlite'] = {
    'ENGINE': 'django.db.backends.sqlite3',
    'NAME': os.path.join(settings.BASE_DIR, 'db.sqlite3'),
}

# Export data
with open('/tmp/django_data_export.json', 'w') as f:
    call_command('dumpdata', 
                 '--database=sqlite',
                 '--exclude=auth.permission',
                 '--exclude=contenttypes',
                 '--exclude=sessions',
                 '--exclude=admin.logentry',
                 '--indent=2',
                 stdout=f)

print("Step 2: Importing data into MySQL...")
# Now import into MySQL (default database)
call_command('loaddata', '/tmp/django_data_export.json', verbosity=2)

print("Migration completed!")
