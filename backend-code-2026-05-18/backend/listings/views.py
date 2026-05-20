from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import F, Q
from django.utils import timezone
from accounts.serializers import UserSerializer
from notifications.models import Notification
from notifications.serializers import NotificationSerializer
from .models import (
    Category,
    Tag,
    Listing,
    ListingImage,
    ListingMediaPolicy,
    Rating,
    Ticket,
    Vibe,
    SavedListing,
    ListingViewHistory,
)
from .serializers import (
    CategorySerializer, TagSerializer, ListingSerializer,
    ListingListSerializer, ListingImageSerializer,
    RatingSerializer, RatingCreateSerializer, TicketSerializer, VibeSerializer
)


def build_ticket_queryset():
    return Ticket.objects.select_related('listing__category', 'listing__owner', 'user').prefetch_related(
        'listing__tags',
        'listing__images',
        'listing__ratings',
        'listing__vibes',
        'listing__saved_by',
        'listing__tickets',
    )


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
            {'detail': f'This listing can only be edited in the first 24 hours after posting. The edit window closed on {formatted}.'},
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
        """Compact app bootstrap payload for the mobile client."""
        self._run_media_cleanup()
        categories = CategorySerializer(
            Category.objects.filter(is_active=True),
            many=True,
            context={'request': request},
        ).data
        listings = ListingSerializer(
            self.get_queryset(),
            many=True,
            context={'request': request},
        ).data
        return Response(
            {
                'categories': categories,
                'listings': listings,
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
        """Create or fetch a confirmed ticket for the current user."""
        listing = self.get_object()
        ticket, created = Ticket.objects.get_or_create(
            listing=listing,
            user=request.user,
            defaults={'status': 'confirmed'},
        )

        if ticket.status != 'confirmed':
            ticket.status = 'confirmed'
            ticket.save(update_fields=['status', 'updated_at'])

        Notification.objects.create(
            user=request.user,
            notification_type='ticket',
            title='Ticket ready',
            message=f'Your pass for {listing.name} is now ready in the app.',
            listing=listing,
        )

        if listing.owner_id and listing.owner_id != request.user.id:
            buyer_name = getattr(request.user, 'name', '') or request.user.email
            Notification.objects.create(
                user=listing.owner,
                notification_type='booking',
                title='New ticket booked',
                message=f'{buyer_name} booked a ticket for {listing.name}.',
                listing=listing,
            )

        serializer = TicketSerializer(ticket, context={'request': request})
        return Response(
            {
                'created': created,
                'ticket': serializer.data,
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

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        ticket = self.get_object()

        if ticket.status != 'confirmed':
            return Response(
                {'detail': 'Only confirmed tickets can be cancelled.'},
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

        if ticket.status != 'confirmed':
            return Response(
                {'detail': 'Only confirmed tickets can be marked as used.'},
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
