from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator
from django.conf import settings


class Category(models.Model):
    """Listing categories."""
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=50, blank=True)
    image = models.ImageField(upload_to='categories/', blank=True, null=True)
    image_url = models.URLField(blank=True, null=True)
    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'categories'
        verbose_name_plural = 'Categories'
        ordering = ['order', 'name']
    
    def __str__(self):
        return self.name


class Tag(models.Model):
    """Vibe tags for listings."""
    name = models.CharField(max_length=50, unique=True)
    slug = models.SlugField(max_length=50, unique=True)
    icon = models.CharField(max_length=50, blank=True)  # Icon class name
    color = models.CharField(max_length=20, default='#ef4444')  # Hex color
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'tags'
        ordering = ['name']
    
    def __str__(self):
        return self.name


class Listing(models.Model):
    """Main listing/venue model."""
    LISTING_KIND_CHOICES = [
        ('listing', 'Listing'),
        ('event', 'Event'),
    ]

    PRICE_CHOICES = [
        ('$', '$ - Budget Friendly'),
        ('$$', '$$ - Moderate'),
        ('$$$', '$$$ - Premium'),
        ('$$$$', '$$$$ - Luxury'),
    ]
    
    # Basic Information
    name = models.CharField(max_length=255)
    listing_kind = models.CharField(max_length=20, choices=LISTING_KIND_CHOICES, default='listing')
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='listings')
    description = models.TextField()
    
    # Location
    address = models.CharField(max_length=500)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    
    # Contact
    phone = models.CharField(max_length=17, blank=True, null=True)
    website = models.URLField(blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    
    # Pricing & Hours
    price_range = models.CharField(max_length=10, choices=PRICE_CHOICES, default='$$')
    display_price = models.CharField(max_length=50, blank=True)
    opening_hours = models.JSONField(default=dict, blank=True)  # {"monday": "08:00-22:00", ...}
    app_data = models.JSONField(default=dict, blank=True)
    
    # Status
    is_active = models.BooleanField(default=True)
    is_trending = models.BooleanField(default=False)
    is_featured = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False, help_text="Verified listings show a verified badge")
    
    # Metadata
    tags = models.ManyToManyField(Tag, related_name='listings', blank=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, 
                             null=True, blank=True, related_name='owned_listings')
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'listings'
        ordering = ['-is_trending', '-is_featured', '-created_at']
        indexes = [
            models.Index(fields=['category', 'is_active']),
            models.Index(fields=['is_trending']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        return self.name
    
    @property
    def average_rating(self):
        """Calculate average rating from all ratings."""
        ratings = self.ratings.all()
        if not ratings.exists():
            return 0.0
        return sum(r.rating for r in ratings) / ratings.count()
    
    @property
    def rating_count(self):
        """Get total number of ratings."""
        return self.ratings.count()
    
    @property
    def primary_image(self):
        """Get primary/cover image."""
        hero = self.images.filter(media_kind='image', image_type='hero').first()
        if hero:
            if hero.image_url:
                return hero.image_url
            if hero.image:
                return hero.image.url
        primary = self.images.filter(media_kind='image', is_primary=True).first()
        if primary:
            if primary.image_url:
                return primary.image_url
            if primary.image:
                return primary.image.url
        first = self.images.filter(media_kind='image').first()
        if first:
            if first.image_url:
                return first.image_url
            if first.image:
                return first.image.url
        return None

    @property
    def ticket_image(self):
        """Get ticket image when available."""
        ticket = self.images.filter(media_kind='image', image_type='ticket').first()
        if ticket:
            if ticket.image_url:
                return ticket.image_url
            if ticket.image:
                return ticket.image.url
        return None

    @property
    def saved_count(self):
        """Get the number of times this listing was saved."""
        return self.saved_by.count()


class ListingImage(models.Model):
    """Multiple images for listings."""
    IMAGE_TYPE_CHOICES = [
        ('gallery', 'Gallery'),
        ('hero', 'Hero'),
        ('ticket', 'Ticket'),
    ]
    MEDIA_KIND_CHOICES = [
        ('image', 'Image'),
        ('video', 'Video'),
    ]

    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='listings/', blank=True, null=True)
    image_url = models.URLField(blank=True, null=True, help_text="External image URL")
    video = models.FileField(upload_to='listings/videos/', blank=True, null=True)
    video_url = models.URLField(blank=True, null=True, help_text="External video URL")
    alt_text = models.CharField(max_length=255, blank=True)
    image_type = models.CharField(max_length=20, choices=IMAGE_TYPE_CHOICES, default='gallery')
    media_kind = models.CharField(max_length=12, choices=MEDIA_KIND_CHOICES, default='image')
    is_primary = models.BooleanField(default=False)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'listing_images'
        ordering = ['order', '-is_primary', 'created_at']
        indexes = [
            models.Index(fields=['listing', 'is_primary']),
        ]
    
    def __str__(self):
        return f"{self.listing.name} - Image {self.id}"
    
    def save(self, *args, **kwargs):
        """Ensure only one primary image per listing."""
        if self.is_primary and self.media_kind == 'image':
            ListingImage.objects.filter(
                listing=self.listing,
                is_primary=True
            ).exclude(pk=self.pk).update(is_primary=False)
        super().save(*args, **kwargs)


class Rating(models.Model):
    """User ratings for listings."""
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name='ratings')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='ratings')
    rating = models.IntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Rating from 1 to 5"
    )
    review = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'ratings'
        unique_together = ['listing', 'user']  # One rating per user per listing
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['listing', 'rating']),
        ]
    
    def __str__(self):
        return f"{self.user.email} - {self.listing.name} - {self.rating} stars"


class Vibe(models.Model):
    """User vibe reactions for listings."""
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name='vibes')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='vibes')
    is_vibing = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'vibes'
        unique_together = ['listing', 'user']  # One vibe per user per listing
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['listing', 'is_vibing']),
        ]
    
    def __str__(self):
        return f"{self.user.email} - {self.listing.name} - {'Vibing' if self.is_vibing else 'Not Vibing'}"


class SavedListing(models.Model):
    """User bookmarks for listings/events."""
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name='saved_by')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='saved_listings')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'saved_listings'
        unique_together = ['listing', 'user']
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['listing', 'created_at']),
        ]

    def __str__(self):
        return f"{self.user.email} saved {self.listing.name}"


class ListingViewHistory(models.Model):
    """Track recently viewed listings per user."""
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name='view_histories')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='listing_view_histories')
    viewed_at = models.DateTimeField(auto_now=True)
    view_count = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'listing_view_history'
        unique_together = ['listing', 'user']
        ordering = ['-viewed_at']
        indexes = [
            models.Index(fields=['user', 'viewed_at']),
            models.Index(fields=['listing', 'viewed_at']),
        ]

    def __str__(self):
        return f"{self.user.email} viewed {self.listing.name}"
