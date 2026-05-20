from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import urlopen

from django.core.files import File
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from accounts.models import User
from listings.models import Category, Listing, ListingImage, SavedListing, Tag, Ticket
from notifications.models import Notification


APP_SEED_CATEGORIES = [
    {
        'name': 'Restaurants',
        'slug': 'restaurants',
        'icon': 'coffee',
        'order': 1,
        'description': 'Full-service places worth lingering in for a meal, drinks, or a night out.',
    },
    {
        'name': 'Bars & Lounges',
        'slug': 'bars-lounges',
        'icon': 'disc',
        'order': 2,
        'description': 'Cocktail bars, lounges, and late-night spaces tuned for vibe-heavy experiences.',
    },
    {
        'name': 'Fast Food',
        'slug': 'fast-food',
        'icon': 'zap',
        'order': 3,
        'description': 'Quick-stop food spots with strong flavor and easy grab-and-go energy.',
    },
    {
        'name': 'Chill Spots',
        'slug': 'chill-spots',
        'icon': 'music',
        'order': 4,
        'description': 'Calmer social spaces for rooftop sets, hangs, and slower evening plans.',
    },
    {
        'name': 'Resorts',
        'slug': 'resorts',
        'icon': 'map-pin',
        'order': 5,
        'description': 'Stay-ready escapes, destination venues, and weekend retreat experiences.',
    },
    {
        'name': 'BnBs',
        'slug': 'bnbs',
        'icon': 'map-pin',
        'order': 6,
        'description': 'Cozy bed and breakfast stays, hosted spaces, and smaller overnight spots.',
    },
]

APP_SEED_LISTINGS = [
    {
        'slug': 'gelora-bung-karno-neon-orbit',
        'name': 'Gelora Bung Karno',
        'category_slug': 'bars-lounges',
        'tag_names': ['Music', 'Nightlife', 'Live Show'],
        'price_range': '$$$',
        'display_price': '$45.90',
        'description': 'Oliver Tree brings a colorful arena show with a cleaner layout, stronger sightlines, and a more focused set list built for a native mobile experience.',
        'address': 'Gelora Bung Karno, Senayan, Jakarta',
        'latitude': -6.2184,
        'longitude': 106.8027,
        'phone': '+62215700111',
        'website': 'https://www.gbk.id/',
        'email': 'tickets@neonorbittour.com',
        'opening_hours': {
            'tuesday': '18:00-23:59',
            'wednesday': '18:00-23:59',
        },
        'app_data': {
            'artist': 'Oliver Tree',
            'title': 'Neon Orbit Tour',
            'venue': 'Gelora Bung Karno',
            'city': 'Jakarta, Indonesia',
            'rating': 4.8,
            'date_label': 'December 29, 2026',
            'day': '29',
            'month': 'Dec',
            'weekday': 'Tuesday',
            'time': '10:00 PM',
            'price': '$45.90',
            'blurb': 'A late-night headline set with a tighter floor plan, brighter visuals, and a faster check-in flow.',
            'highlights': [
                'Priority entry opens 45 minutes before the main set.',
                'Compact standing zones keep the floor comfortable.',
                'Food, merch, and exits are grouped close to the main hall.',
            ],
            'secondary_category_slugs': ['chill-spots'],
            'location': {
                'label': 'Main arena gate',
                'address': 'Gelora Bung Karno, Senayan, Jakarta',
                'note': 'Use the east arrival lane for faster rideshare drop-off.',
                'latitude_delta': 0.012,
                'longitude_delta': 0.012,
            },
            'contacts': [
                {'id': 'phone', 'label': 'Call host', 'icon': 'phone-call', 'url': 'tel:+62215700111'},
                {'id': 'mail', 'label': 'Email', 'icon': 'mail', 'url': 'mailto:tickets@neonorbittour.com'},
                {'id': 'web', 'label': 'Venue site', 'icon': 'globe', 'url': 'https://www.gbk.id/'},
            ],
            'socials': [
                {'id': 'tiktok', 'platform': 'tiktok', 'url': 'https://www.tiktok.com/@olivertree'},
                {'id': 'youtube', 'platform': 'youtube', 'url': 'https://www.youtube.com/@olivertree'},
                {'id': 'facebook', 'platform': 'facebook', 'url': 'https://www.facebook.com/olivertreemusic'},
                {'id': 'instagram', 'platform': 'instagram', 'url': 'https://www.instagram.com/olivertree/'},
                {'id': 'x', 'platform': 'x', 'url': 'https://x.com/OliverTree'},
                {'id': 'web-social', 'platform': 'web', 'url': 'https://www.olivertreemusic.com/'},
            ],
        },
        'images': [
            {
                'source_type': 'local',
                'source': 'assets/images/oliver_tree_concert_1779027961507.png',
                'alt_text': 'Oliver Tree live concert poster',
                'image_type': 'hero',
                'is_primary': True,
                'order': 0,
            },
            {
                'source_type': 'local',
                'source': 'assets/images/oliver_tree_ticket_art_1779027977879.png',
                'alt_text': 'Neon Orbit Tour ticket art',
                'image_type': 'ticket',
                'is_primary': False,
                'order': 1,
            },
        ],
    },
    {
        'slug': 'district-hall-warehouse-frequency',
        'name': 'District Hall',
        'category_slug': 'restaurants',
        'tag_names': ['Food Vendors', 'Electronic', 'Late Night'],
        'price_range': '$$',
        'display_price': '$31.00',
        'description': 'Warehouse Frequency blends live synths, DJ transitions, and food stalls in a space designed around shorter queues and easier circulation.',
        'address': 'District Hall, Newtown, Johannesburg',
        'latitude': -26.2045,
        'longitude': 28.0358,
        'phone': '+27115550188',
        'website': 'https://warehousefrequency.co.za/',
        'email': 'hello@warehousefrequency.co.za',
        'opening_hours': {
            'monday': '18:00-23:30',
            'friday': '18:00-23:30',
        },
        'app_data': {
            'artist': 'Glow District',
            'title': 'Warehouse Frequency',
            'venue': 'District Hall',
            'city': 'Johannesburg, South Africa',
            'rating': 4.6,
            'date_label': 'June 08, 2026',
            'day': '08',
            'month': 'Jun',
            'weekday': 'Monday',
            'time': '09:30 PM',
            'price': '$31.00',
            'blurb': 'Electronic textures, soft amber lighting, and a venue layout tuned for quicker movement.',
            'highlights': [
                'Curated local food vendors open from 7 PM.',
                'Two-stage lineup with clear venue wayfinding.',
                'Cashless entry and instant ticket scan on arrival.',
            ],
            'secondary_category_slugs': ['fast-food', 'bars-lounges'],
            'location': {
                'label': 'Warehouse entry',
                'address': 'District Hall, Newtown, Johannesburg',
                'note': 'Street parking is limited after 8 PM, so shuttle drop-off is recommended.',
                'latitude_delta': 0.013,
                'longitude_delta': 0.013,
            },
            'contacts': [
                {'id': 'phone', 'label': 'Call desk', 'icon': 'phone-call', 'url': 'tel:+27115550188'},
                {'id': 'mail', 'label': 'Email', 'icon': 'mail', 'url': 'mailto:hello@warehousefrequency.co.za'},
                {'id': 'web', 'label': 'Event page', 'icon': 'globe', 'url': 'https://warehousefrequency.co.za/'},
            ],
            'socials': [
                {'id': 'tiktok', 'platform': 'tiktok', 'url': 'https://www.tiktok.com/@warehousefrequency'},
                {'id': 'youtube', 'platform': 'youtube', 'url': 'https://www.youtube.com/@warehousefrequency'},
                {'id': 'facebook', 'platform': 'facebook', 'url': 'https://www.facebook.com/warehousefrequency'},
                {'id': 'instagram', 'platform': 'instagram', 'url': 'https://www.instagram.com/warehousefrequency/'},
                {'id': 'x', 'platform': 'x', 'url': 'https://x.com/warehousefreq'},
                {'id': 'web-social', 'platform': 'web', 'url': 'https://district-hall.co.za/'},
            ],
        },
        'images': [
            {
                'source_type': 'remote',
                'source': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80',
                'alt_text': 'Warehouse Frequency event hero image',
                'image_type': 'hero',
                'is_primary': True,
                'order': 0,
            },
            {
                'source_type': 'remote',
                'source': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1000&q=80',
                'alt_text': 'Warehouse Frequency ticket visual',
                'image_type': 'ticket',
                'is_primary': False,
                'order': 1,
            },
        ],
    },
    {
        'slug': 'harbor-rooftop-skyline-sessions',
        'name': 'Harbor Rooftop',
        'category_slug': 'resorts',
        'tag_names': ['Rooftop', 'Sunset', 'Views'],
        'price_range': '$$$',
        'display_price': '$28.50',
        'description': 'Skyline Sessions is built around a sunset arrival window, small-format tables, and a cleaner visual rhythm that feels less oversized than the original concept.',
        'address': 'Harbor Rooftop, V&A Waterfront, Cape Town',
        'latitude': -33.9035,
        'longitude': 18.4201,
        'phone': '+27215550122',
        'website': 'https://skylinesessions.co.za/',
        'email': 'bookings@skylinesessions.co.za',
        'opening_hours': {
            'tuesday': '16:30-22:00',
            'saturday': '16:30-22:00',
        },
        'app_data': {
            'artist': 'Astra Nova',
            'title': 'Skyline Sessions',
            'venue': 'Harbor Rooftop',
            'city': 'Cape Town, South Africa',
            'rating': 4.7,
            'date_label': 'July 14, 2026',
            'day': '14',
            'month': 'Jul',
            'weekday': 'Tuesday',
            'time': '07:00 PM',
            'price': '$28.50',
            'blurb': 'Golden-hour live set, rooftop tasting menu, and calmer crowd density by design.',
            'highlights': [
                'Reserved tasting lounge with quick pickup lanes.',
                'Sunset acoustic opener before the headline act.',
                'Seat maps and ticket details stay readable at a glance.',
            ],
            'secondary_category_slugs': ['chill-spots', 'restaurants', 'bnbs'],
            'location': {
                'label': 'Rooftop lift lobby',
                'address': 'Harbor Rooftop, V&A Waterfront, Cape Town',
                'note': 'The rooftop elevator is the quickest access point after 6 PM.',
                'latitude_delta': 0.011,
                'longitude_delta': 0.011,
            },
            'contacts': [
                {'id': 'phone', 'label': 'Call venue', 'icon': 'phone-call', 'url': 'tel:+27215550122'},
                {'id': 'mail', 'label': 'Email', 'icon': 'mail', 'url': 'mailto:bookings@skylinesessions.co.za'},
                {'id': 'web', 'label': 'Rooftop site', 'icon': 'globe', 'url': 'https://skylinesessions.co.za/'},
            ],
            'socials': [
                {'id': 'tiktok', 'platform': 'tiktok', 'url': 'https://www.tiktok.com/@skylinesessions'},
                {'id': 'youtube', 'platform': 'youtube', 'url': 'https://www.youtube.com/@skylinesessions'},
                {'id': 'facebook', 'platform': 'facebook', 'url': 'https://www.facebook.com/skylinesessions'},
                {'id': 'instagram', 'platform': 'instagram', 'url': 'https://www.instagram.com/skylinesessions/'},
                {'id': 'x', 'platform': 'x', 'url': 'https://x.com/skylinesessions'},
                {'id': 'web-social', 'platform': 'web', 'url': 'https://harbor-rooftop.co.za/'},
            ],
        },
        'images': [
            {
                'source_type': 'remote',
                'source': 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80',
                'alt_text': 'Skyline Sessions rooftop hero image',
                'image_type': 'hero',
                'is_primary': True,
                'order': 0,
            },
            {
                'source_type': 'remote',
                'source': 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1000&q=80',
                'alt_text': 'Skyline Sessions ticket visual',
                'image_type': 'ticket',
                'is_primary': False,
                'order': 1,
            },
        ],
    },
]

APP_NOTIFICATION_SEED = [
    {
        'notification_type': 'ticket',
        'title': 'Ticket locked in',
        'message': 'Your Neon Orbit Tour pass is confirmed and ready in the app.',
        'listing_slug': 'gelora-bung-karno-neon-orbit',
    },
    {
        'notification_type': 'event',
        'title': 'Doors open soon',
        'message': 'Warehouse Frequency opens in 45 minutes. Keep your QR ready for faster entry.',
        'listing_slug': 'district-hall-warehouse-frequency',
    },
    {
        'notification_type': 'booking',
        'title': 'Rooftop table updated',
        'message': 'Your Skyline Sessions lounge reservation has been moved closer to the sunset deck.',
        'listing_slug': 'harbor-rooftop-skyline-sessions',
    },
]


class Command(BaseCommand):
    help = 'Seed backend categories, listings, images, and notifications for the Expo app sync flow.'

    def handle(self, *args, **options):
        workspace_root = Path(__file__).resolve().parents[5]
        self.stdout.write('Seeding app sync data...')

        with transaction.atomic():
            categories = self._sync_categories()
            tags = self._sync_tags()
            demo_user = self._ensure_demo_user()
            listings = self._sync_listings(categories, tags, demo_user, workspace_root)
            self._sync_notifications(demo_user, listings)
            self._sync_saved_listings(demo_user, listings)
            self._sync_tickets(demo_user, listings)

        self.stdout.write(self.style.SUCCESS('App sync data seeded successfully.'))

    def _sync_categories(self):
        category_map = {}

        for category_data in APP_SEED_CATEGORIES:
            category, _ = Category.objects.update_or_create(
                slug=category_data['slug'],
                defaults={
                    'name': category_data['name'],
                    'description': category_data['description'],
                    'icon': category_data['icon'],
                    'order': category_data['order'],
                    'is_active': True,
                },
            )
            category_map[category.slug] = category

        legacy_category = Category.objects.filter(slug='resorts-and-bnbs').first()
        resort_category = category_map.get('resorts')
        if legacy_category and resort_category:
            Listing.objects.filter(category=legacy_category).update(category=resort_category)
            legacy_category.is_active = False
            legacy_category.order = 999
            legacy_category.save(update_fields=['is_active', 'order'])

        return category_map

    def _sync_tags(self):
        tag_map = {}
        tag_names = sorted(
            {
                tag_name
                for listing_data in APP_SEED_LISTINGS
                for tag_name in listing_data['tag_names']
            }
        )

        for tag_name in tag_names:
            tag, _ = Tag.objects.update_or_create(
                slug=slugify(tag_name),
                defaults={'name': tag_name},
            )
            tag_map[tag.name] = tag

        return tag_map

    def _ensure_demo_user(self):
        demo_user, created = User.objects.get_or_create(
            email='demo@bitesnvibes.local',
            defaults={
                'name': 'Bites and Vibes Demo',
                'is_active': True,
            },
        )

        if created:
            demo_user.set_password('demo12345!')
            demo_user.save(update_fields=['password'])

        return demo_user

    def _sync_listings(self, categories, tags, demo_user, workspace_root):
        listing_map = {}

        for listing_data in APP_SEED_LISTINGS:
            category = categories[listing_data['category_slug']]

            listing, _ = Listing.objects.update_or_create(
                name=listing_data['name'],
                defaults={
                    'listing_kind': 'event',
                    'category': category,
                    'description': listing_data['description'],
                    'address': listing_data['address'],
                    'latitude': listing_data['latitude'],
                    'longitude': listing_data['longitude'],
                    'phone': listing_data['phone'],
                    'website': listing_data['website'],
                    'email': listing_data['email'],
                    'price_range': listing_data['price_range'],
                    'display_price': listing_data['display_price'],
                    'opening_hours': listing_data['opening_hours'],
                    'app_data': listing_data['app_data'],
                    'is_active': True,
                    'is_trending': True,
                    'is_featured': True,
                    'is_verified': True,
                    'owner': demo_user,
                },
            )

            listing.tags.set([tags[tag_name] for tag_name in listing_data['tag_names']])
            listing.images.all().delete()

            for image_data in listing_data['images']:
                self._attach_listing_image(listing, image_data, workspace_root)

            listing_map[listing_data['slug']] = listing

        return listing_map

    def _attach_listing_image(self, listing, image_data, workspace_root):
        listing_image = ListingImage(
            listing=listing,
            alt_text=image_data['alt_text'],
            image_type=image_data['image_type'],
            is_primary=image_data['is_primary'],
            order=image_data['order'],
        )

        if image_data['source_type'] == 'local':
            source_path = workspace_root / image_data['source']
            if source_path.exists():
                with source_path.open('rb') as image_file:
                    listing_image.image.save(source_path.name, File(image_file), save=False)
            else:
                self.stdout.write(self.style.WARNING(f'Local image missing: {source_path}'))
        else:
            downloaded_file = self._download_remote_file(image_data['source'], slugify(listing.name), image_data['image_type'])
            if downloaded_file is not None:
                filename, content = downloaded_file
                listing_image.image.save(filename, content, save=False)
            else:
                listing_image.image_url = image_data['source']

        listing_image.save()

    def _download_remote_file(self, url, listing_slug, image_type):
        try:
            with urlopen(url, timeout=30) as response:
                content = response.read()
                parsed = urlparse(url)
                extension = Path(parsed.path).suffix or '.jpg'
                filename = f'{listing_slug}-{image_type}{extension}'
                return filename, ContentFile(content)
        except (URLError, TimeoutError, ValueError) as exc:
            self.stdout.write(self.style.WARNING(f'Unable to download {url}: {exc}'))
            return None

    def _sync_notifications(self, demo_user, listings):
        for notification_data in APP_NOTIFICATION_SEED:
            listing = listings.get(notification_data['listing_slug'])
            Notification.objects.update_or_create(
                user=demo_user,
                title=notification_data['title'],
                defaults={
                    'notification_type': notification_data['notification_type'],
                    'message': notification_data['message'],
                    'listing': listing,
                    'is_read': False,
                },
            )

    def _sync_saved_listings(self, demo_user, listings):
        saved_slugs = [
            'gelora-bung-karno-neon-orbit',
            'harbor-rooftop-skyline-sessions',
        ]

        SavedListing.objects.filter(user=demo_user).exclude(
            listing__in=[listings[slug] for slug in saved_slugs if slug in listings]
        ).delete()

        for slug in saved_slugs:
            listing = listings.get(slug)
            if not listing:
                continue
            SavedListing.objects.get_or_create(user=demo_user, listing=listing)

    def _sync_tickets(self, demo_user, listings):
        ticket_slugs = [
            'gelora-bung-karno-neon-orbit',
            'district-hall-warehouse-frequency',
        ]

        Ticket.objects.filter(user=demo_user).exclude(
            listing__in=[listings[slug] for slug in ticket_slugs if slug in listings]
        ).delete()

        for slug in ticket_slugs:
            listing = listings.get(slug)
            if not listing:
                continue

            Ticket.objects.get_or_create(
                user=demo_user,
                listing=listing,
                defaults={'status': 'confirmed'},
            )
