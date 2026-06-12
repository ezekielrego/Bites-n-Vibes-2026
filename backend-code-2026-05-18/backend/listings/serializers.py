from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.conf import settings
from django.utils.text import slugify
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from .models import Category, Tag, Listing, ListingImage, Rating, Ticket, Vibe

User = get_user_model()


def build_public_media_url(path):
    return f"{settings.PUBLIC_SITE_URL}{path}"


class CategorySerializer(serializers.ModelSerializer):
    """Serializer for Category."""
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'description', 'icon', 'image', 'image_url', 'order']


class TagSerializer(serializers.ModelSerializer):
    """Serializer for Tag."""
    class Meta:
        model = Tag
        fields = ['id', 'name', 'slug', 'icon', 'color']


class ListingImageSerializer(serializers.ModelSerializer):
    """Serializer for ListingImage."""
    image_url = serializers.SerializerMethodField()
    video_url = serializers.SerializerMethodField()
    
    class Meta:
        model = ListingImage
        fields = ['id', 'image', 'image_url', 'video_url', 'alt_text', 'image_type', 'media_kind', 'is_primary', 'order']
        read_only_fields = ['id']
    
    def get_image_url(self, obj):
        # Return external URL if provided, otherwise return uploaded image URL
        if obj.image_url:
            return obj.image_url
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    def get_video_url(self, obj):
        if obj.video_url:
            return obj.video_url
        if obj.video:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.video.url)
            return obj.video.url
        return None


class RatingSerializer(serializers.ModelSerializer):
    """Serializer for Rating."""
    user_name = serializers.CharField(source='user.name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    
    class Meta:
        model = Rating
        fields = ['id', 'user', 'user_name', 'user_email', 'rating', 'review', 
                 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']


class VibeSerializer(serializers.ModelSerializer):
    """Serializer for Vibe."""
    user_name = serializers.CharField(source='user.name', read_only=True)
    
    class Meta:
        model = Vibe
        fields = ['id', 'user', 'user_name', 'is_vibing', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']


class ListingSerializer(serializers.ModelSerializer):
    """Serializer for Listing."""
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_slug = serializers.CharField(source='category.slug', read_only=True)
    category_icon = serializers.CharField(source='category.icon', read_only=True)
    tags = serializers.PrimaryKeyRelatedField(many=True, queryset=Tag.objects.all(), required=False, write_only=True)
    tags_display = TagSerializer(source='tags', many=True, read_only=True)
    images = ListingImageSerializer(many=True, read_only=True)
    primary_image = serializers.SerializerMethodField()
    ticket_image = serializers.SerializerMethodField()
    average_rating = serializers.ReadOnlyField()
    rating_count = serializers.ReadOnlyField()
    comment_count = serializers.SerializerMethodField()
    owner_name = serializers.CharField(source='owner.name', read_only=True, allow_null=True)
    vibe_percentage = serializers.SerializerMethodField()
    vibe_count = serializers.SerializerMethodField()
    user_is_vibing = serializers.SerializerMethodField()
    user_rating = serializers.SerializerMethodField()
    user_has_saved = serializers.SerializerMethodField()
    user_has_ticket = serializers.SerializerMethodField()
    owner_can_edit = serializers.SerializerMethodField()
    owner_edit_expires_at = serializers.SerializerMethodField()
    owner_sold_count = serializers.SerializerMethodField()
    owner_revenue_total = serializers.SerializerMethodField()
    saved_count = serializers.ReadOnlyField()
    tag_names = serializers.ListField(child=serializers.CharField(), required=False, write_only=True)
    images_payload = serializers.ListField(child=serializers.DictField(), required=False, write_only=True)
    
    def validate_description(self, value):
        """Validate description length."""
        if len(value) > 5000:
            raise serializers.ValidationError("Description cannot exceed 5000 characters.")
        return value
    
    def validate_phone(self, value):
        """Phone is optional - no validation. Convert empty strings to None."""
        if value and value.strip():
            return value.strip()
        return None
    
    def validate_website(self, value):
        """Validate website URL format if provided."""
        if value:
            if not value.startswith(('http://', 'https://')):
                raise serializers.ValidationError("Website must start with http:// or https://")
        return value

    def validate_latitude(self, value):
        return self._normalize_coordinate(value, 'latitude')

    def validate_longitude(self, value):
        return self._normalize_coordinate(value, 'longitude')
    
    class Meta:
        model = Listing
        fields = [
            'id', 'name', 'listing_kind', 'category', 'category_name', 'category_slug', 'category_icon',
            'description', 'address', 'latitude', 'longitude',
            'phone', 'website', 'email', 'price_range', 'display_price', 'opening_hours', 'app_data',
            'is_active', 'is_trending', 'is_featured', 'is_verified', 'accepts_internal_payments',
            'tags', 'tags_display', 'images', 'primary_image', 'ticket_image', 'owner', 'owner_name',
            'average_rating', 'rating_count', 'comment_count',
            'vibe_percentage', 'vibe_count', 'user_is_vibing', 'user_has_saved', 'saved_count',
            'user_rating', 'user_has_ticket', 'owner_can_edit', 'owner_edit_expires_at',
            'owner_sold_count', 'owner_revenue_total',
            'tag_names', 'images_payload',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'average_rating', 'rating_count', 'comment_count',
                          'vibe_percentage', 'vibe_count', 'user_is_vibing', 'user_has_saved', 'saved_count',
                          'user_rating', 'user_has_ticket', 'owner_can_edit', 'owner_edit_expires_at',
                          'owner_sold_count', 'owner_revenue_total',
                          'images', 'primary_image', 'ticket_image', 'tags_display']
        extra_kwargs = {
            'category': {'write_only': True},
            'phone': {'required': False, 'allow_blank': True, 'allow_null': True},
            'address': {'required': True},
            'description': {'required': True},
            'website': {'required': False, 'allow_blank': True, 'allow_null': True},
            'email': {'required': False, 'allow_blank': True, 'allow_null': True},
            'latitude': {'required': False, 'allow_null': True},
            'longitude': {'required': False, 'allow_null': True},
            'opening_hours': {'required': False},
            'display_price': {'required': False, 'allow_blank': True},
            'app_data': {'required': False},
        }
    
    def validate_category(self, value):
        """Ensure category is converted to proper type."""
        if isinstance(value, str) and value.isdigit():
            return int(value)
        return value

    def _normalize_coordinate(self, value, field_name):
        if value in (None, ''):
            return None

        try:
            decimal_value = Decimal(str(value)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
        except (InvalidOperation, ValueError, TypeError):
            raise serializers.ValidationError(f'Enter a valid {field_name}.')

        return decimal_value
    
    def get_primary_image(self, obj):
        """Get primary image URL - return full URL if it's a relative path."""
        primary_img = obj.primary_image
        if not primary_img:
            return None
        
        # If it's already a full URL (external), return as is
        if isinstance(primary_img, str):
            if primary_img.startswith('http://') or primary_img.startswith('https://'):
                return primary_img
            # If it's a relative path starting with /media/, build absolute URI
            if primary_img.startswith('/media/'):
                request = self.context.get('request')
                if request:
                    return request.build_absolute_uri(primary_img)
                # Fallback: build URL manually
                return build_public_media_url(primary_img)
        
        # For FileField objects, build absolute URI
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(primary_img)
        
        return primary_img

    def get_ticket_image(self, obj):
        """Get ticket image URL for app-specific ticket layouts."""
        ticket_img = obj.ticket_image
        if not ticket_img:
            return None

        if isinstance(ticket_img, str):
            if ticket_img.startswith('http://') or ticket_img.startswith('https://'):
                return ticket_img
            if ticket_img.startswith('/media/'):
                request = self.context.get('request')
                if request:
                    return request.build_absolute_uri(ticket_img)
                return build_public_media_url(ticket_img)

        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(ticket_img)

        return ticket_img
    
    def get_vibe_percentage(self, obj):
        """Calculate vibe percentage from vibes."""
        total_vibes = obj.vibes.count()
        if total_vibes == 0:
            return 25  # Default percentage when no vibes yet
        vibing_count = obj.vibes.filter(is_vibing=True).count()
        return round((vibing_count / total_vibes) * 100)
    
    def get_vibe_count(self, obj):
        """Get total number of vibes."""
        return obj.vibes.count()

    def get_comment_count(self, obj):
        annotated = getattr(obj, 'comment_count', None)
        if annotated is not None:
            return int(annotated)
        return obj.comments.filter(is_deleted=False).count()
    
    def get_user_is_vibing(self, obj):
        """Check if current user is vibing."""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            vibe = obj.vibes.filter(user=request.user).first()
            return vibe.is_vibing if vibe else None
        return None

    def get_user_rating(self, obj):
        """Return the current user's existing rating for this listing."""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            rating = obj.ratings.filter(user=request.user).first()
            return rating.rating if rating else None
        return None

    def get_user_has_saved(self, obj):
        """Check if current user has saved this listing."""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.saved_by.filter(user=request.user).exists()
        return False

    def get_user_has_ticket(self, obj):
        """Check if current user already has a confirmed ticket for this listing."""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.tickets.filter(user=request.user, status__in=['confirmed', 'accepted']).exists()
        return False

    def get_owner_can_edit(self, obj):
        request = self.context.get('request')
        if not request:
            return False
        return obj.owner_can_edit(request.user)

    def get_owner_edit_expires_at(self, obj):
        expires_at = getattr(obj, 'owner_edit_expires_at', None)
        return expires_at.isoformat() if expires_at else None

    def get_owner_sold_count(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated or not (request.user.is_superuser or obj.owner_id == request.user.id):
            return 0
        return obj.tickets.filter(status__in=['confirmed', 'accepted', 'used']).count()

    def get_owner_revenue_total(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated or not (request.user.is_superuser or obj.owner_id == request.user.id):
            return '0.00'
        total = sum(ticket.total_amount for ticket in obj.tickets.filter(status__in=['confirmed', 'accepted', 'used']))
        return f'{Decimal(total).quantize(Decimal("0.01"))}'
    
    def validate(self, data):
        """Validate the entire data object."""
        # Ensure price_range is valid before any processing
        if 'price_range' in data:
            valid_choices = ['$', '$$', '$$$', '$$$$']
            if data['price_range'] not in valid_choices:
                raise serializers.ValidationError({
                    'price_range': 'Must be one of: $, $$, $$$, $$$$. Received: ' + str(data.get('price_range'))
                })
        return data
    
    def create(self, validated_data):
        """Create listing with tags and set owner."""
        tags_data = validated_data.pop('tags', [])
        tag_names = validated_data.pop('tag_names', [])
        images_payload = validated_data.pop('images_payload', [])
        request = self.context.get('request')

        if request and request.user.is_authenticated:
            validated_data['owner'] = request.user

        listing = Listing.objects.create(**validated_data)
        self._sync_tags(listing, tags_data, tag_names)
        self._sync_images(listing, images_payload)

        return listing

    def update(self, instance, validated_data):
        """Update listing with optional tag and image payload changes."""
        tags_data = validated_data.pop('tags', None)
        tag_names = validated_data.pop('tag_names', None)
        images_payload = validated_data.pop('images_payload', None)

        for field, value in validated_data.items():
            setattr(instance, field, value)

        instance.save()

        if tags_data is not None or tag_names is not None:
            self._sync_tags(instance, tags_data or [], tag_names or [])

        if images_payload is not None:
            instance.images.all().delete()
            self._sync_images(instance, images_payload)

        return instance

    def _sync_tags(self, listing, tags_data, tag_names):
        tag_objects = list(tags_data)

        for tag_name in tag_names:
            cleaned = tag_name.strip()
            if not cleaned:
                continue
            tag, _ = Tag.objects.get_or_create(
                slug=slugify(cleaned),
                defaults={'name': cleaned},
            )
            tag_objects.append(tag)

        if tag_objects:
            deduped = {tag.id: tag for tag in tag_objects}.values()
            listing.tags.set(deduped)
        else:
            listing.tags.clear()

    def _sync_images(self, listing, images_payload):
        for index, image_data in enumerate(images_payload):
            media_kind = image_data.get('media_kind', 'image')
            image_url = image_data.get('image_url') or image_data.get('url')
            video_url = image_data.get('video_url')

            if media_kind == 'video':
                if not video_url:
                    continue
            elif not image_url:
                continue

            ListingImage.objects.create(
                listing=listing,
                image_url=image_url if media_kind == 'image' else image_url or None,
                video_url=video_url if media_kind == 'video' else None,
                alt_text=image_data.get('alt_text', ''),
                image_type=image_data.get('image_type', 'gallery'),
                media_kind=media_kind,
                is_primary=image_data.get('is_primary', index == 0),
                order=image_data.get('order', index),
            )
    
    def to_representation(self, instance):
        """Add request context for image URLs and ensure tags are returned."""
        representation = super().to_representation(instance)
        request = self.context.get('request')
        
        # Ensure tags_display is populated with tag data
        if 'tags_display' not in representation or not representation['tags_display']:
            representation['tags'] = TagSerializer(instance.tags.all(), many=True).data
        else:
            # Use tags_display as tags for frontend compatibility
            representation['tags'] = representation.get('tags_display', [])
        
        if instance.images.exists():
            representation['images'] = ListingImageSerializer(
                instance.images.all(),
                many=True,
                context={'request': request} if request else {}
            ).data
        return representation


class ListingListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing list views."""
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_slug = serializers.CharField(source='category.slug', read_only=True)
    category_icon = serializers.CharField(source='category.icon', read_only=True)
    owner_name = serializers.CharField(source='owner.name', read_only=True, allow_null=True)
    primary_image = serializers.SerializerMethodField()
    ticket_image = serializers.SerializerMethodField()
    average_rating = serializers.ReadOnlyField()
    rating_count = serializers.ReadOnlyField()
    comment_count = serializers.SerializerMethodField()
    tags = TagSerializer(many=True, read_only=True)
    vibe_percentage = serializers.SerializerMethodField()
    vibe_count = serializers.SerializerMethodField()
    user_is_vibing = serializers.SerializerMethodField()
    user_rating = serializers.SerializerMethodField()
    user_has_saved = serializers.SerializerMethodField()
    user_has_ticket = serializers.SerializerMethodField()
    owner_can_edit = serializers.SerializerMethodField()
    owner_edit_expires_at = serializers.SerializerMethodField()
    saved_count = serializers.ReadOnlyField()
    
    class Meta:
        model = Listing
        fields = [
            'id', 'name', 'listing_kind', 'category_name', 'category_slug', 'category_icon',
            'address', 'phone', 'price_range', 'display_price', 'app_data',
            'primary_image', 'ticket_image', 'average_rating', 'rating_count', 'comment_count', 'is_trending', 'is_verified', 'accepts_internal_payments',
            'tags', 'vibe_percentage', 'vibe_count', 'user_is_vibing', 'user_rating', 'user_has_saved', 'user_has_ticket', 'owner_can_edit', 'owner_edit_expires_at', 'saved_count',
            'owner', 'owner_name', 'created_at', 'latitude', 'longitude'
        ]
    
    def get_primary_image(self, obj):
        primary_img = obj.primary_image
        if not primary_img:
            return None
        
        # If it's already a full URL (external), return as is
        if isinstance(primary_img, str):
            if primary_img.startswith('http://') or primary_img.startswith('https://'):
                return primary_img
            # If it's a relative path starting with /media/, build absolute URI
            if primary_img.startswith('/media/'):
                request = self.context.get('request')
                if request:
                    return request.build_absolute_uri(primary_img)
                # Fallback: build URL manually
                return build_public_media_url(primary_img)
        
        # For FileField objects, build absolute URI
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(primary_img)
        
        return primary_img

    def get_ticket_image(self, obj):
        ticket_img = obj.ticket_image
        if not ticket_img:
            return None

        if isinstance(ticket_img, str):
            if ticket_img.startswith('http://') or ticket_img.startswith('https://'):
                return ticket_img
            if ticket_img.startswith('/media/'):
                request = self.context.get('request')
                if request:
                    return request.build_absolute_uri(ticket_img)
                return build_public_media_url(ticket_img)

        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(ticket_img)

        return ticket_img
    
    def get_vibe_percentage(self, obj):
        """Calculate vibe percentage from vibes."""
        total_vibes = obj.vibes.count()
        if total_vibes == 0:
            return 25  # Default percentage when no vibes yet
        vibing_count = obj.vibes.filter(is_vibing=True).count()
        return round((vibing_count / total_vibes) * 100)

    def get_vibe_count(self, obj):
        return obj.vibes.count()

    def get_user_is_vibing(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            vibe = obj.vibes.filter(user=request.user).first()
            return vibe.is_vibing if vibe else None
        return None

    def get_user_rating(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            rating = obj.ratings.filter(user=request.user).first()
            return rating.rating if rating else None
        return None

    def get_user_has_saved(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.saved_by.filter(user=request.user).exists()
        return False

    def get_user_has_ticket(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.tickets.filter(user=request.user, status__in=['confirmed', 'accepted']).exists()
        return False

    def get_owner_can_edit(self, obj):
        request = self.context.get('request')
        if not request:
            return False
        return obj.owner_can_edit(request.user)

    def get_owner_edit_expires_at(self, obj):
        expires_at = getattr(obj, 'owner_edit_expires_at', None)
        return expires_at.isoformat() if expires_at else None


class TicketSerializer(serializers.ModelSerializer):
    """Serializer for booked tickets."""

    listing = ListingSerializer(read_only=True)
    listing_id = serializers.IntegerField(source='listing.id', read_only=True)
    listing_name = serializers.CharField(source='listing.name', read_only=True)
    buyer_name = serializers.CharField(source='user.name', read_only=True, allow_null=True)
    buyer_email = serializers.CharField(source='user.email', read_only=True, allow_null=True)
    can_cancel = serializers.SerializerMethodField()
    can_accept = serializers.SerializerMethodField()
    can_mark_used = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            'id',
            'listing',
            'listing_id',
            'listing_name',
            'buyer_name',
            'buyer_email',
            'action_type',
            'quantity',
            'unit_price',
            'total_amount',
            'currency',
            'reference_code',
            'qr_payload',
            'status',
            'payment_status',
            'payment_method',
            'payer_phone',
            'request_note',
            'paynow_reference',
            'can_cancel',
            'can_accept',
            'can_mark_used',
            'can_manage',
            'booked_at',
            'updated_at',
        ]
        read_only_fields = fields

    def _request_user(self):
        request = self.context.get('request')
        if not request:
            return None
        return request.user

    def get_can_cancel(self, obj):
        user = self._request_user()
        if not user or not user.is_authenticated or obj.status not in {'requested', 'pending', 'confirmed', 'accepted'}:
            return False
        return user.is_superuser or user.id == obj.user_id or user.id == obj.listing.owner_id

    def get_can_accept(self, obj):
        user = self._request_user()
        if not user or not user.is_authenticated or obj.status != 'requested':
            return False
        return user.is_superuser or user.id == obj.listing.owner_id

    def get_can_mark_used(self, obj):
        user = self._request_user()
        if not user or not user.is_authenticated or obj.status not in {'confirmed', 'accepted'}:
            return False
        return user.is_superuser or user.id == obj.listing.owner_id

    def get_can_manage(self, obj):
        user = self._request_user()
        if not user or not user.is_authenticated:
            return False
        return user.is_superuser or user.id == obj.listing.owner_id


class RatingCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating ratings."""
    class Meta:
        model = Rating
        fields = ['rating', 'review']
    
    def create(self, validated_data):
        listing = self.context['listing']
        user = self.context['user']
        rating, created = Rating.objects.update_or_create(
            listing=listing,
            user=user,
            defaults=validated_data
        )
        return rating
