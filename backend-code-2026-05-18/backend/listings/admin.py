from django.contrib import admin
from .models import Category, Tag, Listing, ListingImage, Rating, Vibe


class ListingImageInline(admin.TabularInline):
    """Inline admin for listing images."""
    model = ListingImage
    extra = 1
    fields = ['image', 'alt_text', 'is_primary', 'order']


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    """Admin configuration for Category."""
    list_display = ['name', 'slug', 'order', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'slug']
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    """Admin configuration for Tag."""
    list_display = ['name', 'slug', 'color', 'created_at']
    search_fields = ['name', 'slug']
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    """Admin configuration for Listing."""
    list_display = ['name', 'category', 'price_range', 'is_active', 'is_trending', 
                   'is_featured', 'average_rating', 'created_at']
    list_filter = ['category', 'is_active', 'is_trending', 'is_featured', 
                  'price_range', 'created_at']
    search_fields = ['name', 'description', 'address', 'phone']
    filter_horizontal = ['tags']
    readonly_fields = ['average_rating', 'rating_count', 'created_at', 'updated_at']
    inlines = [ListingImageInline]
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'category', 'description', 'tags')
        }),
        ('Location', {
            'fields': ('address', 'latitude', 'longitude')
        }),
        ('Contact', {
            'fields': ('phone', 'website', 'email')
        }),
        ('Pricing & Hours', {
            'fields': ('price_range', 'opening_hours')
        }),
        ('Status', {
            'fields': ('is_active', 'is_trending', 'is_featured', 'owner')
        }),
        ('Statistics', {
            'fields': ('average_rating', 'rating_count')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )


@admin.register(ListingImage)
class ListingImageAdmin(admin.ModelAdmin):
    """Admin configuration for ListingImage."""
    list_display = ['listing', 'is_primary', 'order', 'created_at']
    list_filter = ['is_primary', 'created_at']
    search_fields = ['listing__name']


@admin.register(Rating)
class RatingAdmin(admin.ModelAdmin):
    """Admin configuration for Rating."""
    list_display = ['listing', 'user', 'rating', 'created_at']
    list_filter = ['rating', 'created_at']
    search_fields = ['listing__name', 'user__email', 'review']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Vibe)
class VibeAdmin(admin.ModelAdmin):
    """Admin configuration for Vibe."""
    list_display = ['listing', 'user', 'is_vibing', 'created_at']
    list_filter = ['is_vibing', 'created_at']
    search_fields = ['listing__name', 'user__email']
    readonly_fields = ['created_at', 'updated_at']

