#!/usr/bin/env python
"""
Script to migrate data from SQLite to MySQL database.
This script exports data from SQLite and imports it into MySQL.
"""
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bitesweb.settings')
django.setup()

from django.conf import settings
from django.core.management import call_command
from django.db import connections
import json

def export_from_sqlite():
    """Export data from SQLite database."""
    print("=" * 60)
    print("Step 1: Exporting data from SQLite database...")
    print("=" * 60)
    
    # Temporarily switch to SQLite
    original_db = settings.DATABASES['default'].copy()
    settings.DATABASES['sqlite'] = {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': os.path.join(settings.BASE_DIR, 'db.sqlite3'),
    }
    settings.DATABASES['default'] = settings.DATABASES['sqlite']
    
    # Check if SQLite database exists
    sqlite_path = settings.DATABASES['default']['NAME']
    if not os.path.exists(sqlite_path):
        print(f"ERROR: SQLite database not found at {sqlite_path}")
        return False
    
    # Export data - include all apps
    export_file = '/tmp/sqlite_export.json'
    try:
        with open(export_file, 'w') as f:
            call_command(
                'dumpdata',
                '--database=default',
                '--natural-foreign',
                '--natural-primary',
                '--exclude=contenttypes',
                '--exclude=auth.permission',
                '--exclude=sessions',
                '--exclude=admin.logentry',
                'accounts',
                'listings',
                'comments',
                'notifications',
                'sites',
                '--indent=2',
                stdout=f
            )
        
        # Check export file size
        file_size = os.path.getsize(export_file)
        if file_size < 100:  # Less than 100 bytes probably means empty
            print(f"WARNING: Export file is very small ({file_size} bytes)")
            with open(export_file, 'r') as f:
                content = f.read()
                if '[]' in content or len(content.strip()) < 10:
                    print("ERROR: No data found in SQLite database")
                    return False
        
        print(f"✓ Data exported successfully to {export_file}")
        print(f"  File size: {file_size} bytes")
        
        # Show what was exported
        with open(export_file, 'r') as f:
            data = json.load(f)
            print(f"  Total objects: {len(data)}")
            
            # Count by model
            model_counts = {}
            for obj in data:
                model = obj.get('model', '')
                model_counts[model] = model_counts.get(model, 0) + 1
            
            print("\n  Objects by model:")
            for model, count in sorted(model_counts.items()):
                print(f"    - {model}: {count}")
        
        return export_file
        
    except Exception as e:
        print(f"ERROR exporting data: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Restore MySQL as default
        settings.DATABASES['default'] = original_db


def import_to_mysql(export_file):
    """Import data into MySQL database."""
    print("\n" + "=" * 60)
    print("Step 2: Importing data into MySQL database...")
    print("=" * 60)
    
    # Ensure we're using MySQL
    original_db = settings.DATABASES['default'].copy()
    if 'mysql' not in original_db['ENGINE']:
        print("ERROR: Not using MySQL database!")
        return False
    
    try:
        # Load data
        print(f"Loading data from {export_file}...")
        call_command('loaddata', export_file, verbosity=2)
        
        print("\n✓ Data imported successfully!")
        return True
        
    except Exception as e:
        print(f"ERROR importing data: {e}")
        import traceback
        traceback.print_exc()
        return False


def verify_migration():
    """Verify the migration was successful."""
    print("\n" + "=" * 60)
    print("Step 3: Verifying migration...")
    print("=" * 60)
    
    try:
        from accounts.models import User
        from listings.models import Listing, Category, Tag, ListingImage
        from comments.models import Comment
        from notifications.models import Notification
        
        print("\nMySQL Database Contents:")
        print(f"  Users: {User.objects.count()}")
        print(f"  Categories: {Category.objects.count()}")
        print(f"  Tags: {Tag.objects.count()}")
        print(f"  Listings: {Listing.objects.count()}")
        print(f"  Listing Images: {ListingImage.objects.count()}")
        print(f"  Comments: {Comment.objects.count()}")
        print(f"  Notifications: {Notification.objects.count()}")
        
        # Show some sample data
        if Category.objects.exists():
            print("\n  Sample Categories:")
            for cat in Category.objects.all()[:5]:
                print(f"    - {cat.id}: {cat.name} ({cat.slug})")
        
        if Listing.objects.exists():
            print("\n  Sample Listings:")
            for listing in Listing.objects.all()[:5]:
                print(f"    - {listing.id}: {listing.name} (Images: {listing.images.count()})")
        
        if User.objects.exists():
            print("\n  Sample Users:")
            for user in User.objects.all()[:5]:
                print(f"    - {user.id}: {user.email} ({user.name})")
        
        print("\n✓ Verification complete!")
        return True
        
    except Exception as e:
        print(f"ERROR during verification: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main migration function."""
    print("\n" + "=" * 60)
    print("SQLite to MySQL Migration Script")
    print("=" * 60)
    print()
    
    # Step 1: Export from SQLite
    export_file = export_from_sqlite()
    if not export_file:
        print("\n❌ Migration failed at export step")
        sys.exit(1)
    
    # Step 2: Import to MySQL
    if not import_to_mysql(export_file):
        print("\n❌ Migration failed at import step")
        sys.exit(1)
    
    # Step 3: Verify
    if not verify_migration():
        print("\n⚠️  Migration completed but verification had issues")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("✅ Migration completed successfully!")
    print("=" * 60)
    print(f"\nExport file saved at: {export_file}")
    print("You can delete it after verifying the migration.")


if __name__ == '__main__':
    main()
