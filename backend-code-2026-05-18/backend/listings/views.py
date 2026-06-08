from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticatedOrReadOnly, IsAuthenticated
from django.conf import settings
from django_filters.rest_framework import DjangoFilterBackend
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Count, F, Q
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal, InvalidOperation
import re
from accounts.serializers import UserSerializer
from notifications.models import Notification
from notifications.serializers import NotificationSerializer
from .models import (
    Category,
    Tag,
    Listing,
    ListingImage,
    ListingMediaPolicy,
    AppVersionPolicy,
    Rating,
    Ticket,
    Vibe,
    SavedListing,
    ListingViewHistory,
    SearchQueryLog,
    ListingFeedImpression,
)
from .serializers import (
    CategorySerializer, TagSerializer, ListingSerializer,
    ListingListSerializer, ListingImageSerializer,
    RatingSerializer, RatingCreateSerializer, TicketSerializer, VibeSerializer
)
from .paynow import FAILED_STATUSES, SUCCESS_STATUSES, PaynowClient, PaynowError


def build_ticket_queryset():
    return Ticket.objects.select_related('listing__category', 'listing__owner', 'user').prefetch_related(
        'listing__tags',
        'listing__images',
        'listing__ratings',
        'listing__vibes',
        'listing__saved_by',
        'listing__tickets',
    )


def booking_action_for_listing(listing):
    category_slug = getattr(listing.category, 'slug', '') or ''
    listing_kind = getattr(listing, 'listing_kind', '')

    if listing_kind == 'event' or 'event' in category_slug:
        return 'ticket'
    if category_slug in {'restaurants', 'bars-lounges', 'chill-spots'}:
        return 'reservation'
    if category_slug in {'resorts', 'bnbs', 'resorts-bnbs'}:
        return 'booking'
    if category_slug == 'fast-food':
        return 'order'
    return 'booking'


def amount_for_listing(listing):
    candidates = [
        getattr(listing, 'display_price', ''),
        (getattr(listing, 'app_data', {}) or {}).get('price', ''),
        (getattr(listing, 'app_data', {}) or {}).get('amount', ''),
    ]

    for candidate in candidates:
        if candidate in (None, ''):
            continue
        if isinstance(candidate, (int, float, Decimal)):
            return Decimal(str(candidate)).quantize(Decimal('0.01'))
        match = re.search(r'\d+(?:\.\d{1,2})?', str(candidate).replace(',', ''))
        if match:
            try:
                return Decimal(match.group(0)).quantize(Decimal('0.01'))
            except (InvalidOperation, ValueError):
                continue

    return Decimal('0.00')


def payment_label_for_action(action_type):
    labels = {
        'ticket': 'ticket',
        'reservation': 'reservation',
        'booking': 'booking',
        'order': 'order',
        'enquiry': 'request',
    }
    return labels.get(action_type, 'booking')


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for Category (read-only)."""
    queryset = Category.objects.filter(is_active=True)
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    pagination_class = None


class TagViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for Tag (read-only)."""
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    pagination_class = None


class ListingViewSet(viewsets.ModelViewSet):
    """ViewSet for Listing."""
    queryset = Listing.objects.filter(is_active=True).prefetch_related(
        'tags', 'images', 'category', 'owner', 'ratings', 'vibes', 'saved_by', 'view_histories', 'tickets'
    ).select_related('category', 'owner')
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'is_trending', 'is_featured', 'price_range', 'owner']
    search_fields = ['name', 'description', 'address', 'tags__name']
    ordering_fields = ['created_at', 'average_rating', 'rating_count']
    ordering = ['-is_trending', '-created_at']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ListingListSerializer
        return ListingSerializer
    
    def get_serializer_context(self):
        """Add request to serializer context for absolute URLs."""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def _can_manage_listing(self, listing, user):
        return bool(user and user.is_authenticated and (user.is_superuser or listing.owner_id == user.id))

    def _edit_window_error(self, listing):
        expires_at = timezone.localtime(listing.owner_edit_expires_at)
        formatted = expires_at.strftime('%d %b at %H:%M')
        return Response(
            {'detail': f'This listing can only be edited in the first 48 hours after posting. The edit window closed on {formatted}.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    def _ensure_editable(self, listing, user):
        if not self._can_manage_listing(listing, user):
            return Response(
                {'detail': 'You do not have permission to edit this listing.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if not listing.owner_can_edit(user):
            return self._edit_window_error(listing)

        return None

    def _run_media_cleanup(self):
        try:
            ListingMediaPolicy.get_solo().cleanup_expired_videos()
        except Exception:
            return

    def list(self, request, *args, **kwargs):
        self._run_media_cleanup()
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        self._run_media_cleanup()
        return super().retrieve(request, *args, **kwargs)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticatedOrReadOnly], url_path='app-feed')
    def app_feed(self, request):
        """Paginated, database-backed feed/search for the mobile client."""
        self._run_media_cleanup()

        page_number = max(int(request.query_params.get('page', 1) or 1), 1)
        page_size = min(max(int(request.query_params.get('page_size', 12) or 12), 4), 30)
        search = (request.query_params.get('search') or '').strip()
        category = (request.query_params.get('category') or '').strip()
        category_signal = None
        latitude = self._read_float_query_param(request, 'lat')
        longitude = self._read_float_query_param(request, 'lng')

        queryset = self.get_queryset()

        if category and category != 'all':
            category_filter = Q(category__slug=category)
            if category.isdigit():
                category_filter |= Q(category_id=int(category))
            queryset = queryset.filter(category_filter)
            category_signal = (
                Category.objects.filter(id=int(category)).first()
                if category.isdigit()
                else Category.objects.filter(slug=category).first()
            )

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(description__icontains=search)
                | Q(address__icontains=search)
                | Q(category__name__icontains=search)
                | Q(tags__name__icontains=search)
                | Q(owner__name__icontains=search)
            )

        queryset = queryset.distinct()
        ranked_listings = self._rank_feed_listings(queryset, request.user, search, latitude, longitude)
        paginator = Paginator(ranked_listings, page_size)
        page = paginator.get_page(page_number)
        base_url = request.build_absolute_uri(request.path)

        def page_url(next_page):
            if next_page is None:
                return None
            params = request.query_params.copy()
            params['page'] = str(next_page)
            params['page_size'] = str(page_size)
            return f'{base_url}?{params.urlencode()}'

        results = ListingSerializer(
            page.object_list,
            many=True,
            context={'request': request},
        ).data
        self._record_feed_signals(
            request.user,
            page.object_list,
            search,
            category_signal,
            paginator.count,
            page.start_index() if page.object_list else 0,
            page_number,
        )

        return Response(
            {
                'count': paginator.count,
                'next': page_url(page.next_page_number()) if page.has_next() else None,
                'previous': page_url(page.previous_page_number()) if page.has_previous() else None,
                'results': results,
                'meta': {
                    'search': search,
                    'category': category or 'all',
                    'ranking': 'fresh_relevant_unwatched',
                },
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticatedOrReadOnly], url_path='app-search-suggestions')
    def app_search_suggestions(self, request):
        """Search suggestions for the mobile home search box."""
        query = (request.query_params.get('q') or '').strip()
        category = (request.query_params.get('category') or '').strip()
        limit = min(max(int(request.query_params.get('limit', 8) or 8), 4), 12)
        category_obj = self._resolve_category(category)
        suggestions = []
        seen_queries = set()

        def add_suggestion(label, suggestion_query=None, suggestion_type='popular', hint=''):
            cleaned_label = (label or '').strip()
            cleaned_query = (suggestion_query or cleaned_label).strip()
            if not cleaned_label or not cleaned_query:
                return

            dedupe_key = cleaned_query.lower()
            if dedupe_key in seen_queries:
                return

            seen_queries.add(dedupe_key)
            suggestions.append({
                'id': f'{suggestion_type}-{len(suggestions) + 1}',
                'label': cleaned_label,
                'query': cleaned_query,
                'type': suggestion_type,
                'hint': hint,
            })

        if not query or 'near'.startswith(query.lower()) or query.lower() in {'near me', 'nearby'}:
            add_suggestion('Near me', 'near me', 'nearby', 'Closest listings around you')

        logs = SearchQueryLog.objects.all()
        if category_obj:
            logs = logs.filter(Q(category=category_obj) | Q(category__isnull=True))
        if query:
            logs = logs.filter(query__icontains=query)

        for item in (
            logs.values('query')
            .annotate(search_count=Count('id'))
            .order_by('-search_count', '-query')[:limit]
        ):
            add_suggestion(item['query'], item['query'], 'popular', f"{item['search_count']} searches")

        category_queryset = Category.objects.filter(is_active=True)
        if query:
            category_queryset = category_queryset.filter(name__icontains=query)
        for item in category_queryset.order_by('order', 'name')[:4]:
            add_suggestion(item.name, item.name, 'category', 'Category')

        tag_queryset = Tag.objects.all()
        if query:
            tag_queryset = tag_queryset.filter(name__icontains=query)
        for item in tag_queryset.order_by('name')[:4]:
            add_suggestion(item.name, item.name, 'tag', 'Popular tag')

        listing_queryset = self.get_queryset()
        if category_obj:
            listing_queryset = listing_queryset.filter(category=category_obj)
        if query:
            listing_queryset = listing_queryset.filter(
                Q(name__icontains=query)
                | Q(description__icontains=query)
                | Q(address__icontains=query)
                | Q(tags__name__icontains=query)
            )
        for item in listing_queryset.distinct().order_by('-is_featured', '-is_trending', '-created_at')[:4]:
            add_suggestion(item.name, item.name, 'listing', item.category.name)

        return Response(
            {
                'results': suggestions[:limit],
                'meta': {
                    'query': query,
                    'category': category or 'all',
                },
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticatedOrReadOnly], url_path='app-search-log')
    def app_search_log(self, request):
        """Explicit search logging for selected suggestions or submitted terms."""
        user = request.user if getattr(request.user, 'is_authenticated', False) else None
        query = (request.data.get('query') or '').strip()
        category = (request.data.get('category') or '').strip()
        result_count = request.data.get('result_count') or 0

        if not query:
            return Response({'detail': 'query is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result_count = max(int(result_count), 0)
        except (TypeError, ValueError):
            result_count = 0

        SearchQueryLog.objects.create(
            user=user,
            query=query[:180],
            category=self._resolve_category(category),
            result_count=result_count,
        )

        return Response({'ok': True}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticatedOrReadOnly], url_path='app-spotlight')
    def app_spotlight(self, request):
        """Backend-decided Spotlight listings for the mobile home surface."""
        self._run_media_cleanup()

        category = (request.query_params.get('category') or '').strip()
        limit = min(max(int(request.query_params.get('limit', 30) or 30), 1), 30)
        category_obj = self._resolve_category(category)
        queryset = self.get_queryset()

        if category_obj:
            queryset = queryset.filter(category=category_obj)

        ranked_listings = self._rank_spotlight_listings(queryset)
        results = ListingSerializer(
            ranked_listings[:limit],
            many=True,
            context={'request': request},
        ).data

        self._record_feed_signals(
            request.user,
            ranked_listings[:limit],
            '',
            category_obj,
            len(ranked_listings),
            1,
            1,
            source='app_spotlight',
        )

        return Response(
            {
                'count': len(ranked_listings),
                'results': results,
                'meta': {
                    'category': category or 'all',
                    'ranking': 'rolling_24h_engagement',
                    'ranking_window_hours': 24,
                    'fallback': 'previous_24h_then_all_time_engagement',
                },
            },
            status=status.HTTP_200_OK,
        )

    def _read_float_query_param(self, request, name):
        value = request.query_params.get(name)
        if value in (None, ''):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _resolve_category(self, category):
        category = (category or '').strip()
        if not category or category == 'all':
            return None
        if category.isdigit():
            return Category.objects.filter(id=int(category)).first()
        return Category.objects.filter(slug=category).first()

    def _record_feed_signals(self, user, listings, search, category, result_count, start_position, page_number, source='app_feed'):
        if not getattr(user, 'is_authenticated', False):
            return

        if source == 'app_feed' and search and page_number == 1:
            SearchQueryLog.objects.create(
                user=user,
                query=search[:180],
                category=category,
                result_count=result_count,
            )

        impressions = [
            ListingFeedImpression(
                user=user,
                listing=listing,
                category=category,
                search_query=search[:180],
                source=source,
                position=start_position + index,
            )
            for index, listing in enumerate(listings)
        ]
        if impressions:
            ListingFeedImpression.objects.bulk_create(impressions, batch_size=30)

    def _rank_feed_listings(self, queryset, user, search, latitude=None, longitude=None):
        now = timezone.now()
        search_lower = search.lower()
        listings = list(
            queryset.select_related('category', 'owner').prefetch_related(
                'tags', 'images', 'ratings', 'saved_by', 'tickets', 'view_histories'
            )[:500]
        )

        viewed = {}
        served = {}
        interest_categories = set()
        interest_tags = set()

        if getattr(user, 'is_authenticated', False):
            histories = user.listing_view_histories.select_related('listing__category').prefetch_related('listing__tags')
            viewed = {history.listing_id: history for history in histories}
            served = {
                impression.listing_id: impression
                for impression in user.feed_impressions.select_related('listing').all()[:300]
            }
            interest_categories.update(
                history.listing.category_id for history in histories[:80] if history.listing.category_id
            )
            for saved in user.saved_listings.select_related('listing__category').prefetch_related('listing__tags')[:80]:
                if saved.listing.category_id:
                    interest_categories.add(saved.listing.category_id)
                interest_tags.update(tag.id for tag in saved.listing.tags.all())
            for history in histories[:80]:
                interest_tags.update(tag.id for tag in history.listing.tags.all())

        def score_listing(listing):
            score = 0.0
            tag_names = [tag.name.lower() for tag in listing.tags.all()]

            if search_lower:
                if search_lower in listing.name.lower():
                    score += 90
                if search_lower in listing.description.lower():
                    score += 35
                if search_lower in listing.address.lower():
                    score += 24
                if search_lower in listing.category.name.lower():
                    score += 30
                if any(search_lower in tag_name for tag_name in tag_names):
                    score += 34

            if listing.is_trending:
                score += 28
            if listing.is_featured:
                score += 22
            if listing.is_verified:
                score += 8

            age_days = max((now - listing.created_at).days, 0)
            if age_days <= 2:
                score += 28
            elif age_days <= 7:
                score += 18
            elif age_days <= 30:
                score += 8

            score += min(float(listing.average_rating or 0) * 4, 20)
            score += min(listing.saved_count * 1.3, 24)
            score += min(listing.tickets.count() * 1.0, 18)
            score += min(listing.view_histories.count() * 0.35, 14)

            if listing.category_id in interest_categories:
                score += 18
            score += min(len(set(tag.id for tag in listing.tags.all()) & interest_tags) * 6, 18)

            if listing.images.filter(media_kind='video').exists():
                score += 7
            if listing.images.count() > 1:
                score += 4

            if latitude is not None and longitude is not None and listing.latitude and listing.longitude:
                distance = abs(float(listing.latitude) - latitude) + abs(float(listing.longitude) - longitude)
                score += max(0, 30 - distance * 95)

            history = viewed.get(listing.id)
            if history:
                hours_since_view = (now - history.viewed_at).total_seconds() / 3600
                if hours_since_view < 24:
                    score -= 48
                elif hours_since_view < 72:
                    score -= 26
                score -= min(history.view_count * 3, 18)
            else:
                impression = served.get(listing.id)
                if impression:
                    hours_since_served = (now - impression.created_at).total_seconds() / 3600
                    if hours_since_served < 4:
                        score -= 18
                    elif hours_since_served < 24:
                        score -= 9

            return score

        return sorted(listings, key=lambda listing: (score_listing(listing), listing.created_at), reverse=True)

    def _rank_spotlight_listings(self, queryset):
        now = timezone.now()
        current_start = now - timedelta(hours=24)
        previous_start = now - timedelta(hours=48)
        listings = list(
            queryset.select_related('category', 'owner').prefetch_related(
                'tags', 'images', 'ratings', 'saved_by', 'tickets', 'comments'
            )[:500]
        )

        def in_window(value, start=None, end=None):
            if value is None:
                return False
            if start is not None and value < start:
                return False
            if end is not None and value >= end:
                return False
            return True

        def score_window(listing, start=None, end=None):
            vibe_items = [
                vibe for vibe in listing.vibes.all()
                if vibe.is_vibing and in_window(vibe.created_at, start, end)
            ]
            saved_items = [
                saved for saved in listing.saved_by.all()
                if in_window(saved.created_at, start, end)
            ]
            rating_items = [
                rating for rating in listing.ratings.all()
                if in_window(rating.created_at, start, end)
            ]
            comment_items = [
                comment for comment in listing.comments.all()
                if not comment.is_deleted and in_window(comment.created_at, start, end)
            ]
            ticket_items = [
                ticket for ticket in listing.tickets.all()
                if in_window(ticket.booked_at, start, end)
            ]
            latest_times = [
                item.created_at for item in vibe_items
            ] + [
                item.created_at for item in saved_items
            ] + [
                item.created_at for item in rating_items
            ] + [
                item.created_at for item in comment_items
            ] + [
                item.booked_at for item in ticket_items
            ]
            score = (
                len(vibe_items)
                + len(saved_items)
                + sum(float(rating.rating or 0) for rating in rating_items)
                + len(comment_items)
                + len(ticket_items)
            )
            latest_activity = max(latest_times) if latest_times else listing.created_at
            return score, latest_activity

        def ranked_for_window(start=None, end=None):
            scored = [
                (listing, *score_window(listing, start, end))
                for listing in listings
            ]
            engaged = [
                item for item in scored
                if item[1] > 0
            ]
            return [
                item[0]
                for item in sorted(engaged, key=lambda item: (item[1], item[2], item[0].created_at), reverse=True)
            ]

        ranked = []
        seen_ids = set()
        for window_ranked in (
            ranked_for_window(current_start, now),
            ranked_for_window(previous_start, current_start),
            ranked_for_window(),
        ):
            for listing in window_ranked:
                if listing.id in seen_ids:
                    continue
                ranked.append(listing)
                seen_ids.add(listing.id)

        return ranked

    @action(detail=False, methods=['get'], permission_classes=[AllowAny], url_path='app-version')
    def app_version(self, request):
        platform = (request.query_params.get('platform') or 'android').strip().lower()
        policy = AppVersionPolicy.get_solo()

        return Response(
            {
                'latest_version': policy.latest_version,
                'min_required_version': policy.min_required_version,
                'force_update': policy.force_update,
                'update_url': policy.update_url_for_platform(platform),
                'message': policy.message,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticatedOrReadOnly], url_path='app-bootstrap')
    def app_bootstrap(self, request):
        """Full app payload with authenticated user context."""
        self._run_media_cleanup()
        listings = self.get_queryset()
        payload = {
            'categories': CategorySerializer(
                Category.objects.filter(is_active=True),
                many=True,
                context={'request': request},
            ).data,
            'listings': ListingSerializer(
                listings,
                many=True,
                context={'request': request},
            ).data,
        }

        if request.user.is_authenticated:
            history_entries = (
                request.user.listing_view_histories.select_related('listing__category', 'listing__owner')
                .prefetch_related('listing__tags', 'listing__images', 'listing__ratings', 'listing__vibes', 'listing__saved_by')
                .order_by('-viewed_at')[:60]
            )
            history_listings = [entry.listing for entry in history_entries if entry.listing.is_active]
            payload.update(
                {
                    'profile': UserSerializer(request.user, context={'request': request}).data,
                    'my_listings': ListingSerializer(
                        listings.filter(owner=request.user),
                        many=True,
                        context={'request': request},
                    ).data,
                    'notifications': NotificationSerializer(
                        request.user.notifications.select_related('listing').all()[:20],
                        many=True,
                    ).data,
                    'unread_notification_count': request.user.notifications.filter(is_read=False).count(),
                    'history': ListingSerializer(
                        history_listings,
                        many=True,
                        context={'request': request},
                    ).data,
                    'tickets': TicketSerializer(
                        build_ticket_queryset().filter(user=request.user)[:40],
                        many=True,
                        context={'request': request},
                    ).data,
                    'received_tickets': TicketSerializer(
                        build_ticket_queryset().filter(listing__owner=request.user)[:60],
                        many=True,
                        context={'request': request},
                    ).data,
                }
            )

        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post', 'get'], permission_classes=[AllowAny], url_path='paynow-result')
    def paynow_result(self, request):
        """Accept Paynow server callbacks and update the matching booking."""
        reference = str(request.data.get('reference') or request.query_params.get('reference') or '').strip()
        poll_url = str(request.data.get('pollurl') or request.query_params.get('pollurl') or '').strip()
        status_value = str(request.data.get('status') or request.query_params.get('status') or '').strip().lower()

        ticket = None
        if reference:
            ticket = Ticket.objects.filter(reference_code=reference).select_related('listing', 'user', 'listing__owner').first()
        if not ticket and poll_url:
            ticket = Ticket.objects.filter(paynow_poll_url=poll_url).select_related('listing', 'user', 'listing__owner').first()
        if not ticket:
            return Response({'detail': 'Booking reference not found.'}, status=status.HTTP_404_NOT_FOUND)

        if status_value in SUCCESS_STATUSES:
            ticket.status = 'requested'
            ticket.payment_status = 'paid'
            ticket.paid_at = timezone.now()
        elif status_value in FAILED_STATUSES:
            ticket.status = 'failed'
            ticket.payment_status = 'failed'

        ticket.payment_last_response = dict(request.data or request.query_params)
        ticket.save(update_fields=['status', 'payment_status', 'payment_last_response', 'paid_at', 'updated_at'])
        return Response({'ok': True}, status=status.HTTP_200_OK)
    
    def create(self, request, *args, **kwargs):
        """Override create to provide user-friendly error messages."""
        try:
            self._run_media_cleanup()
            serializer = self.get_serializer(data=request.data)
            if not serializer.is_valid():
                # Build user-friendly error messages
                error_messages = []
                for field, errors in serializer.errors.items():
                    error_list = errors if isinstance(errors, list) else [errors]
                    # Convert field names to user-friendly format
                    friendly_field = field.replace('_', ' ').title()
                    error_messages.append(f"{friendly_field}: {', '.join(str(e) for e in error_list)}")
                
                return Response({
                    'errors': serializer.errors,
                    'detail': 'Please check the form and try again.',
                    'message': '; '.join(error_messages) if error_messages else 'Please check the form and try again.'
                }, status=status.HTTP_400_BAD_REQUEST)
            return super().create(request, *args, **kwargs)
        except Exception as e:
            # Return user-friendly error message without exposing server details
            return Response({
                'detail': 'An error occurred while creating the listing.',
                'message': 'Unable to create listing. Please refresh the page and try again.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def upload_images(self, request, pk=None):
        """Upload multiple listing media files for a listing."""
        try:
            listing = self.get_object()

            permission_error = self._ensure_editable(listing, request.user)
            if permission_error:
                return permission_error
            
            media_files = request.FILES.getlist('media') or request.FILES.getlist('images')
            
            if not media_files:
                return Response(
                    {'detail': 'No media provided. Please upload at least one file.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            uploaded_images = []
            has_primary_image = listing.images.filter(is_primary=True, media_kind='image').exists()
            for idx, media_file in enumerate(media_files):
                image_type = request.data.get(f'image_type_{idx}', 'gallery')
                media_kind = request.data.get(f'media_kind_{idx}', '')
                if media_kind not in {'image', 'video'}:
                    content_type = getattr(media_file, 'content_type', '') or ''
                    media_kind = 'video' if content_type.startswith('video/') else 'image'
                poster_file = request.FILES.get(f'poster_{idx}')
                requested_primary = str(request.data.get(f'is_primary_{idx}', '')).lower() in {'1', 'true', 'yes', 'on'}
                is_primary = media_kind == 'image' and (requested_primary or not has_primary_image)
                if is_primary:
                    has_primary_image = True
                order = int(request.data.get(f'order_{idx}', idx))
                payload = dict(
                    listing=listing,
                    alt_text=request.data.get(f'alt_text_{idx}', ''),
                    image_type=image_type,
                    media_kind=media_kind,
                    is_primary=is_primary,
                    order=order
                )
                if media_kind == 'video':
                    payload['video'] = media_file
                    if poster_file:
                        payload['image'] = poster_file
                else:
                    payload['image'] = media_file
                listing_image = ListingImage.objects.create(**payload)
                uploaded_images.append(ListingImageSerializer(
                    listing_image,
                    context={'request': request}
                ).data)

            self._run_media_cleanup()
            return Response(uploaded_images, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response(
                {'detail': 'Unable to upload images. Please try again.'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['get', 'post'], permission_classes=[IsAuthenticatedOrReadOnly])
    def ratings(self, request, pk=None):
        """Get or create rating for a listing."""
        listing = self.get_object()
        
        if request.method == 'GET':
            ratings = Rating.objects.filter(listing=listing).select_related('user')
            serializer = RatingSerializer(ratings, many=True)
            return Response(serializer.data)
        
        elif request.method == 'POST':
            serializer = RatingCreateSerializer(
                data=request.data,
                context={'listing': listing, 'user': request.user}
            )
            if serializer.is_valid():
                rating = serializer.save()
                if hasattr(listing, '_prefetched_objects_cache'):
                    listing._prefetched_objects_cache.pop('ratings', None)
                return Response(
                    {
                        'rating': RatingSerializer(rating).data,
                        'average_rating': listing.average_rating,
                        'rating_count': listing.rating_count,
                    },
                    status=status.HTTP_201_CREATED,
                )
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticatedOrReadOnly])
    def my_rating(self, request, pk=None):
        """Get current user's rating for a listing."""
        listing = self.get_object()
        try:
            rating = Rating.objects.get(listing=listing, user=request.user)
            serializer = RatingSerializer(rating)
            return Response(serializer.data)
        except Rating.DoesNotExist:
            return Response({'rating': None}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def my_listings(self, request):
        """Get current user's listings (or all listings for superusers)."""
        if request.user.is_superuser:
            # Superusers can see all listings
            listings = self.queryset.all()
        else:
            # Regular users see only their own listings
            listings = self.queryset.filter(owner=request.user)
        serializer = self.get_serializer(listings, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated], url_path='my-tickets')
    def my_tickets(self, request):
        """Get the current user's booked tickets."""
        tickets = build_ticket_queryset().filter(user=request.user)
        serializer = TicketSerializer(tickets, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated], url_path='received-tickets')
    def received_tickets(self, request):
        """Get tickets booked for the current user's hosted listings."""
        tickets = build_ticket_queryset().filter(listing__owner=request.user)
        serializer = TicketSerializer(tickets, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated], url_path='saved')
    def saved(self, request):
        """Get listings saved by the current user."""
        listings = self.queryset.filter(saved_by__user=request.user).distinct()
        serializer = ListingSerializer(listings, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    def update(self, request, *args, **kwargs):
        """Update listing - allow superusers to update any listing."""
        listing = self.get_object()

        permission_error = self._ensure_editable(listing, request.user)
        if permission_error:
            return permission_error

        return super().update(request, *args, **kwargs)
    
    def destroy(self, request, *args, **kwargs):
        """Delete listing - allow superusers to delete any listing."""
        listing = self.get_object()
        
        # Check permissions: owner or superuser
        if listing.owner != request.user and not request.user.is_superuser:
            return Response(
                {'detail': 'You do not have permission to delete this listing.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        return super().destroy(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticatedOrReadOnly])
    def toggle_vibe(self, request, pk=None):
        """Toggle vibe for a listing."""
        listing = self.get_object()
        
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        is_vibing = request.data.get('is_vibing', True)
        
        vibe, created = Vibe.objects.update_or_create(
            listing=listing,
            user=request.user,
            defaults={'is_vibing': is_vibing}
        )
        
        # Calculate new vibe percentage
        total_vibes = listing.vibes.count()
        vibing_count = listing.vibes.filter(is_vibing=True).count()
        vibe_percentage = round((vibing_count / total_vibes) * 100) if total_vibes > 0 else 25
        
        serializer = VibeSerializer(vibe)
        return Response({
            'vibe': serializer.data,
            'vibe_percentage': vibe_percentage,
            'vibe_count': total_vibes,
            'is_vibing': vibe.is_vibing
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated], url_path='toggle-save')
    def toggle_save(self, request, pk=None):
        """Toggle bookmark/save state for a listing."""
        listing = self.get_object()
        saved, created = SavedListing.objects.get_or_create(listing=listing, user=request.user)

        if created:
            is_saved = True
        else:
            saved.delete()
            is_saved = False

        return Response(
            {
                'listing_id': listing.id,
                'is_saved': is_saved,
                'saved_count': listing.saved_by.count(),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated], url_path='book')
    def book(self, request, pk=None):
        """Start or fetch a category-aware booking/payment for the current user."""
        listing = self.get_object()
        action_type = booking_action_for_listing(listing)
        quantity = request.data.get('quantity', 1)
        payment_method = str(request.data.get('payment_method') or '').strip().lower()
        payer_phone = str(request.data.get('phone') or '').strip()
        request_note = str(request.data.get('request_note') or request.data.get('note') or '').strip()
        unit_price = amount_for_listing(listing)

        try:
            quantity = min(max(int(quantity), 1), 20)
        except (TypeError, ValueError):
            quantity = 1

        total_amount = (unit_price * quantity).quantize(Decimal('0.01'))
        needs_payment = total_amount > 0 and listing.accepts_internal_payments

        if needs_payment and payment_method not in dict(Ticket.PAYMENT_METHOD_CHOICES):
            return Response(
                {'detail': 'Choose a payment method to continue.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if needs_payment and not payer_phone:
            return Response(
                {'detail': 'Enter the phone number linked to your payment wallet.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not request_note:
            return Response(
                {'detail': 'Tell the host your preferred time, quantity, or any request details.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_ticket = Ticket.objects.filter(
            listing=listing,
            user=request.user,
            status__in=['requested', 'pending', 'confirmed', 'accepted'],
        ).order_by('-booked_at').first()

        if existing_ticket and existing_ticket.status in {'confirmed', 'accepted'}:
            serializer = TicketSerializer(existing_ticket, context={'request': request})
            return Response(
                {
                    'created': False,
                    'ticket': serializer.data,
                    'payment_required': False,
                    'payment_status': existing_ticket.payment_status,
                },
                status=status.HTTP_200_OK,
            )

        with transaction.atomic():
            ticket = existing_ticket or Ticket(
                listing=listing,
                user=request.user,
            )
            created = ticket.pk is None
            ticket.action_type = action_type
            ticket.quantity = quantity
            ticket.unit_price = unit_price
            ticket.total_amount = total_amount
            ticket.currency = 'USD'
            ticket.payment_method = payment_method if needs_payment else ''
            ticket.payer_phone = payer_phone if needs_payment else ''
            ticket.request_note = request_note

            if not needs_payment:
                ticket.status = 'requested'
                ticket.payment_status = 'not_required'
                ticket.paid_at = None
                ticket.save()
            else:
                ticket.status = 'pending'
                ticket.payment_status = 'pending'
                ticket.save()

                client = PaynowClient()
                try:
                    checkout = client.begin_express_checkout(
                        reference=ticket.reference_code,
                        amount=ticket.total_amount,
                        email=request.user.email,
                        phone=ticket.payer_phone,
                        method=ticket.payment_method,
                        description=f'{listing.name} {payment_label_for_action(action_type)}',
                    )
                except PaynowError as exc:
                    ticket.status = 'failed'
                    ticket.payment_status = 'failed'
                    ticket.payment_last_response = {'error': str(exc)}
                    ticket.save(update_fields=['status', 'payment_status', 'payment_last_response', 'updated_at'])
                    return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

                ticket.paynow_reference = checkout.get('paynowreference') or ticket.paynow_reference
                ticket.paynow_poll_url = checkout.get('pollurl') or ticket.paynow_poll_url
                ticket.paynow_browser_url = checkout.get('browserurl') or ticket.paynow_browser_url
                ticket.payment_last_response = checkout.get('raw') or checkout

                if checkout.get('status') in SUCCESS_STATUSES:
                    ticket.status = 'requested'
                    ticket.payment_status = 'paid'
                    ticket.paid_at = timezone.now()
                elif checkout.get('status') in FAILED_STATUSES:
                    ticket.status = 'failed'
                    ticket.payment_status = 'failed'
                ticket.save(update_fields=[
                    'status',
                    'payment_status',
                    'paynow_reference',
                    'paynow_poll_url',
                    'paynow_browser_url',
                    'payment_last_response',
                    'paid_at',
                    'updated_at',
                ])

        title = 'Request sent'
        if ticket.status == 'pending':
            title = 'Payment started'
        elif ticket.payment_status == 'paid':
            title = 'Payment received'

        Notification.objects.create(
            user=request.user,
            notification_type='ticket' if action_type == 'ticket' else 'booking',
            title=title,
            message=(
                f'Your {payment_label_for_action(action_type)} for {listing.name} was sent to the host for confirmation.'
                if ticket.status == 'requested'
                else f'Approve the {ticket.payment_method} payment on your phone to complete {listing.name}.'
            ),
            listing=listing,
        )

        if listing.owner_id and listing.owner_id != request.user.id and ticket.status == 'requested':
            buyer_name = getattr(request.user, 'name', '') or request.user.email
            note_preview = f' Note: {ticket.request_note[:120]}' if ticket.request_note else ''
            Notification.objects.create(
                user=listing.owner,
                notification_type='booking',
                title=f'Confirm {payment_label_for_action(action_type)}',
                message=f'{buyer_name} requested {quantity} for {listing.name}.{note_preview}',
                listing=listing,
            )

        serializer = TicketSerializer(ticket, context={'request': request})
        return Response(
            {
                'created': created,
                'ticket': serializer.data,
                'payment_required': needs_payment,
                'payment_status': ticket.payment_status,
                'poll_after_seconds': 4 if ticket.status == 'pending' else None,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated], url_path='clear-history')
    def clear_history(self, request):
        """Clear the current user's viewed listing history."""
        deleted_count, _ = request.user.listing_view_histories.all().delete()
        return Response(
            {
                'message': 'History cleared.',
                'deleted_count': deleted_count,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated], url_path='remove-from-history')
    def remove_from_history(self, request, pk=None):
        """Remove a single listing from the current user's view history."""
        listing = self.get_object()
        deleted_count, _ = request.user.listing_view_histories.filter(listing=listing).delete()
        return Response(
            {
                'listing_id': listing.id,
                'removed': deleted_count > 0,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated], url_path='record-view')
    def record_view(self, request, pk=None):
        """Persist a user's viewed listing history."""
        listing = self.get_object()
        history, created = ListingViewHistory.objects.get_or_create(
            listing=listing,
            user=request.user,
            defaults={'view_count': 1},
        )

        if not created:
            ListingViewHistory.objects.filter(pk=history.pk).update(
                view_count=F('view_count') + 1,
            )
            history.refresh_from_db()

        return Response(
            {
                'listing_id': listing.id,
                'view_count': history.view_count,
                'viewed_at': history.viewed_at,
            },
            status=status.HTTP_200_OK,
        )
    
    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticatedOrReadOnly])
    def my_vibe(self, request, pk=None):
        """Get current user's vibe for a listing."""
        listing = self.get_object()
        if not request.user.is_authenticated:
            return Response({'is_vibing': None}, status=status.HTTP_200_OK)
        
        try:
            vibe = Vibe.objects.get(listing=listing, user=request.user)
            serializer = VibeSerializer(vibe)
            return Response(serializer.data)
        except Vibe.DoesNotExist:
            return Response({'is_vibing': None}, status=status.HTTP_200_OK)


class TicketViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for user and owner ticket management."""

    serializer_class = TicketSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        return build_ticket_queryset().filter(
            Q(user=user) | Q(listing__owner=user) | Q(listing__owner__isnull=True, user=user)
        ).distinct()

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(build_ticket_queryset().filter(user=request.user), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='received')
    def received(self, request):
        serializer = self.get_serializer(build_ticket_queryset().filter(listing__owner=request.user), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='poll-payment')
    def poll_payment(self, request, pk=None):
        ticket = self.get_object()

        if ticket.payment_status == 'paid' or ticket.status in {'requested', 'confirmed', 'accepted'}:
            return Response({'ticket': self.get_serializer(ticket).data}, status=status.HTTP_200_OK)

        try:
            payment = PaynowClient().poll(ticket.paynow_poll_url)
        except PaynowError as exc:
            return Response(
                {'detail': str(exc), 'ticket': self.get_serializer(ticket).data},
                status=status.HTTP_202_ACCEPTED,
            )

        previous_status = ticket.status
        ticket.payment_last_response = payment.get('raw') or payment
        if payment.get('status') in SUCCESS_STATUSES:
            ticket.status = 'requested'
            ticket.payment_status = 'paid'
            ticket.paid_at = timezone.now()
        elif payment.get('status') in FAILED_STATUSES:
            ticket.status = 'failed'
            ticket.payment_status = 'failed'
        ticket.save(update_fields=['status', 'payment_status', 'payment_last_response', 'paid_at', 'updated_at'])

        if previous_status != 'requested' and ticket.status == 'requested':
            Notification.objects.create(
                user=ticket.user,
                notification_type='ticket' if ticket.action_type == 'ticket' else 'booking',
                title='Payment received',
                message=f'Your {payment_label_for_action(ticket.action_type)} for {ticket.listing.name} is waiting for host confirmation.',
                listing=ticket.listing,
            )
            if ticket.listing.owner_id and ticket.listing.owner_id != ticket.user_id:
                buyer_name = getattr(ticket.user, 'name', '') or ticket.user.email
                note_preview = f' Note: {ticket.request_note[:120]}' if ticket.request_note else ''
                Notification.objects.create(
                    user=ticket.listing.owner,
                    notification_type='booking',
                    title=f'Confirm paid {payment_label_for_action(ticket.action_type)}',
                    message=f'{buyer_name} paid {ticket.currency} {ticket.total_amount} for {ticket.listing.name}.{note_preview}',
                    listing=ticket.listing,
                )

        return Response({'ticket': self.get_serializer(ticket).data}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='verify-qr')
    def verify_qr(self, request):
        qr_value = str(request.data.get('qr') or request.data.get('qr_payload') or '').strip()
        reference = str(request.data.get('reference') or '').strip()
        if not qr_value and not reference:
            return Response({'detail': 'Scan a QR code or enter a reference.'}, status=status.HTTP_400_BAD_REQUEST)

        tickets = build_ticket_queryset()
        ticket = (
            tickets.filter(qr_payload=qr_value).first()
            if qr_value
            else tickets.filter(reference_code__iexact=reference).first()
        )
        if not ticket:
            return Response({'valid': False, 'detail': 'This booking was not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not (request.user.is_superuser or request.user.id == ticket.listing.owner_id):
            return Response({'detail': 'Only the listing owner can verify this booking.'}, status=status.HTTP_403_FORBIDDEN)

        if ticket.status in {'confirmed', 'accepted'}:
            ticket.status = 'used'
            ticket.save(update_fields=['status', 'updated_at'])
            if ticket.user_id != request.user.id:
                Notification.objects.create(
                    user=ticket.user,
                    notification_type='ticket',
                    title='Checked in',
                    message=f'Your {payment_label_for_action(ticket.action_type)} for {ticket.listing.name} was verified.',
                    listing=ticket.listing,
                )

        return Response(
            {
                'valid': ticket.status in {'confirmed', 'used'},
                'ticket': self.get_serializer(ticket).data,
                'message': 'Booking verified.' if ticket.status == 'used' else f'Booking status: {ticket.status}.',
            },
            status=status.HTTP_200_OK,
        )

    def _confirm_ticket(self, request, ticket):
        if ticket.status == 'confirmed':
            return Response(
                {
                    'message': 'Booking is already confirmed.',
                    'ticket': self.get_serializer(ticket).data,
                },
                status=status.HTTP_200_OK,
            )

        if ticket.status != 'requested':
            return Response(
                {'detail': 'Only requested bookings can be confirmed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not (request.user.is_superuser or request.user.id == ticket.listing.owner_id):
            return Response(
                {'detail': 'You do not have permission to confirm this booking.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        ticket.status = 'confirmed'
        ticket.save(update_fields=['status', 'updated_at'])

        if ticket.user_id != request.user.id:
            Notification.objects.create(
                user=ticket.user,
                notification_type='ticket' if ticket.action_type == 'ticket' else 'booking',
                title='Booking confirmed',
                message=f'Your {payment_label_for_action(ticket.action_type)} for {ticket.listing.name} has been confirmed by the host.',
                listing=ticket.listing,
            )

        serializer = self.get_serializer(ticket)
        return Response(
            {
                'message': 'Booking confirmed.',
                'ticket': serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        ticket = self.get_object()
        return self._confirm_ticket(request, ticket)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        ticket = self.get_object()
        return self._confirm_ticket(request, ticket)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        ticket = self.get_object()

        if ticket.status not in {'requested', 'pending', 'confirmed', 'accepted'}:
            return Response(
                {'detail': 'Only active ticket requests can be cancelled.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_owner = request.user.is_superuser or request.user.id == ticket.listing.owner_id
        is_buyer = request.user.id == ticket.user_id
        if not (is_owner or is_buyer):
            return Response(
                {'detail': 'You do not have permission to cancel this ticket.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        ticket.status = 'cancelled'
        ticket.save(update_fields=['status', 'updated_at'])

        if is_buyer and ticket.listing.owner_id and ticket.listing.owner_id != request.user.id:
            buyer_name = getattr(request.user, 'name', '') or request.user.email
            Notification.objects.create(
                user=ticket.listing.owner,
                notification_type='booking',
                title='Ticket cancelled',
                message=f'{buyer_name} cancelled their ticket for {ticket.listing.name}.',
                listing=ticket.listing,
            )
        elif is_owner and ticket.user_id != request.user.id:
            Notification.objects.create(
                user=ticket.user,
                notification_type='ticket',
                title='Ticket cancelled',
                message=f'Your ticket for {ticket.listing.name} was cancelled by the host.',
                listing=ticket.listing,
            )

        serializer = self.get_serializer(ticket)
        return Response(
            {
                'message': 'Ticket cancelled.',
                'ticket': serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'], url_path='mark-used')
    def mark_used(self, request, pk=None):
        ticket = self.get_object()

        if ticket.status not in {'confirmed', 'accepted'}:
            return Response(
                {'detail': 'Only confirmed or accepted tickets can be marked as used.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not (request.user.is_superuser or request.user.id == ticket.listing.owner_id):
            return Response(
                {'detail': 'You do not have permission to manage this ticket.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        ticket.status = 'used'
        ticket.save(update_fields=['status', 'updated_at'])

        if ticket.user_id != request.user.id:
            Notification.objects.create(
                user=ticket.user,
                notification_type='ticket',
                title='Ticket checked in',
                message=f'Your ticket for {ticket.listing.name} has been marked as used.',
                listing=ticket.listing,
            )

        serializer = self.get_serializer(ticket)
        return Response(
            {
                'message': 'Ticket marked as used.',
                'ticket': serializer.data,
            },
            status=status.HTTP_200_OK,
        )
