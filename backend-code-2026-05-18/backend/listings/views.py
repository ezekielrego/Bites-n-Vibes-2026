from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.shortcuts import get_object_or_404
from django.db.models import F
from accounts.serializers import UserSerializer
from notifications.serializers import NotificationSerializer
from .models import Category, Tag, Listing, ListingImage, Rating, Vibe, SavedListing, ListingViewHistory
from .serializers import (
    CategorySerializer, TagSerializer, ListingSerializer,
    ListingListSerializer, ListingImageSerializer,
    RatingSerializer, RatingCreateSerializer, VibeSerializer
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
        'tags', 'images', 'category', 'owner', 'ratings', 'vibes', 'saved_by', 'view_histories'
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

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticatedOrReadOnly], url_path='app-feed')
    def app_feed(self, request):
        """Compact app bootstrap payload for the mobile client."""
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
                .order_by('-viewed_at')[:20]
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
                }
            )

        return Response(payload, status=status.HTTP_200_OK)
    
    def create(self, request, *args, **kwargs):
        """Override create to provide user-friendly error messages."""
        try:
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
            
            # Check if user owns the listing or is superuser
            if listing.owner != request.user and not request.user.is_superuser:
                return Response(
                    {'detail': 'You do not have permission to upload images to this listing.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
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
                if media_kind == 'video' and image_type != 'gallery':
                    image_type = 'gallery'
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
                else:
                    payload['image'] = media_file
                listing_image = ListingImage.objects.create(**payload)
                uploaded_images.append(ListingImageSerializer(
                    listing_image,
                    context={'request': request}
                ).data)
            
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

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated], url_path='saved')
    def saved(self, request):
        """Get listings saved by the current user."""
        listings = self.queryset.filter(saved_by__user=request.user).distinct()
        serializer = ListingSerializer(listings, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    def update(self, request, *args, **kwargs):
        """Update listing - allow superusers to update any listing."""
        listing = self.get_object()
        
        # Check permissions: owner or superuser
        if listing.owner != request.user and not request.user.is_superuser:
            return Response(
                {'detail': 'You do not have permission to edit this listing.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
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
