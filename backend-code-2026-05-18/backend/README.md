# Bites n Vibes - Django Backend API

Complete Django REST API backend for the Bites n Vibes listing application.

## Features

- ✅ JWT Authentication (Access & Refresh Tokens)
- ✅ Google OAuth Integration
- ✅ User Registration & Password Reset
- ✅ Listing Management (CRUD)
- ✅ Multiple Image Upload for Listings
- ✅ Categories Management (Backend-driven)
- ✅ Tags/Vibes System
- ✅ Ratings & Reviews
- ✅ Nested Comments with Replies
- ✅ Media Attachments in Comments (Images, Videos, Links)
- ✅ Email Notifications (Celery + Redis)
- ✅ Real-time Notifications API
- ✅ Optimized Queries (select_related, prefetch_related)

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your settings:
- `SECRET_KEY`: Django secret key
- `DEBUG`: True for development
- `FRONTEND_URL`: Frontend URL (http://localhost:3000)
- `EMAIL_*`: Email configuration
- `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: For Google OAuth
- `CELERY_BROKER_URL`: Redis URL for Celery

### 3. Database Migration

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
```

### 4. Create Initial Data (Optional)

Create categories, tags, and sample listings:

```bash
python manage.py shell
```

```python
from listings.models import Category, Tag

# Create Categories
categories = [
    ('Restaurants', 'restaurants'),
    ('Bars & Lounges', 'bars-lounges'),
    ('Fast Food', 'fast-food'),
    ('Chill Spots', 'chill-spots'),
    ('Resorts', 'resorts'),
]

for name, slug in categories:
    Category.objects.get_or_create(name=name, slug=slug)

# Create Tags
tags = ['Elegant', 'Romantic', 'Fine Dining', 'Vibrant', 'Music', 'Views', 
        'Quick', 'Modern', 'Tasty', 'Serene', 'Nature', 'Chill', 'Luxury', 
        'Cocktails', 'Nightlife', 'Relaxed', 'Outdoor', 'Family']

for tag_name in tags:
    Tag.objects.get_or_create(name=tag_name, slug=tag_name.lower().replace(' ', '-'))
```

### 5. Run Development Server

```bash
python manage.py runserver
```

API will be available at: `http://localhost:8000`

### 6. Run Celery Worker (for email notifications)

In a separate terminal:

```bash
celery -A bitesweb worker --loglevel=info
```

### 7. Run Celery Beat (for scheduled tasks - optional)

```bash
celery -A bitesweb beat --loglevel=info
```

## API Endpoints

### Authentication

- `POST /api/auth/register/` - User registration
- `POST /api/auth/token/` - Get JWT tokens (login)
- `POST /api/auth/token/refresh/` - Refresh access token
- `POST /api/auth/google/` - Google OAuth login
- `GET /api/auth/profile/` - Get current user profile
- `PUT /api/auth/profile/update/` - Update profile
- `POST /api/auth/change-password/` - Change password
- `POST /api/auth/password-reset/` - Request password reset
- `POST /api/auth/password-reset/confirm/` - Confirm password reset

### Listings

- `GET /api/listings/` - List all listings (filterable, searchable)
- `POST /api/listings/` - Create listing (authenticated)
- `GET /api/listings/{id}/` - Get listing details
- `PUT /api/listings/{id}/` - Update listing
- `DELETE /api/listings/{id}/` - Delete listing
- `POST /api/listings/{id}/upload_images/` - Upload multiple images
- `GET /api/listings/{id}/ratings/` - Get ratings for listing
- `POST /api/listings/{id}/ratings/` - Create/update rating
- `GET /api/listings/{id}/my_rating/` - Get current user's rating

### Categories

- `GET /api/listings/categories/` - List all categories
- `GET /api/listings/categories/{id}/` - Get category details

### Tags

- `GET /api/listings/tags/` - List all tags
- `GET /api/listings/tags/{id}/` - Get tag details

### Comments

- `GET /api/comments/` - List comments (filter by listing, parent)
- `POST /api/comments/` - Create comment
- `GET /api/comments/{id}/` - Get comment details
- `PUT /api/comments/{id}/` - Update comment
- `DELETE /api/comments/{id}/` - Delete comment
- `POST /api/comments/{id}/add_attachment/` - Add attachment to comment
- `POST /api/comments/{id}/soft_delete/` - Soft delete comment
- `GET /api/comments/for_listing/?listing_id={id}` - Get top-level comments for listing

### Notifications

- `GET /api/notifications/` - List user notifications
- `GET /api/notifications/{id}/` - Get notification details
- `POST /api/notifications/{id}/mark_read/` - Mark notification as read
- `POST /api/notifications/mark_all_read/` - Mark all as read
- `GET /api/notifications/unread_count/` - Get unread count

## API Usage Examples

### Register User

```bash
POST /api/auth/register/
{
  "email": "user@example.com",
  "name": "John Doe",
  "password": "securepassword123",
  "password2": "securepassword123"
}
```

### Login

```bash
POST /api/auth/token/
{
  "email": "user@example.com",
  "password": "securepassword123"
}

Response:
{
  "refresh": "...",
  "access": "..."
}
```

### Create Listing (with images)

```bash
POST /api/listings/
Authorization: Bearer {access_token}
{
  "name": "Mtotwe Kitchen",
  "category": 1,
  "description": "Amazing restaurant...",
  "address": "12 Vibe Street, Harare",
  "phone": "+263783324584",
  "price_range": "$$",
  "tags": [1, 2, 3]
}

# Then upload images
POST /api/listings/{id}/upload_images/
Content-Type: multipart/form-data
images: [file1, file2, file3]
```

### Create Comment with Reply

```bash
# Top-level comment
POST /api/comments/
Authorization: Bearer {access_token}
{
  "listing": 1,
  "message": "Great place!",
  "role": "Foodie",
  "attachments": [
    {
      "attachment_type": "image",
      "file": <file>,
      "alt_text": "Photo of food"
    }
  ]
}

# Reply to comment
POST /api/comments/
Authorization: Bearer {access_token}
{
  "listing": 1,
  "parent": 1,  # ID of parent comment
  "message": "Thanks for the review!"
}
```

## Models Overview

### User (Custom)
- Email-based authentication
- Profile with avatar support
- Notification preferences

### Listing
- Full CRUD operations
- Category relationship
- Tags (many-to-many)
- Multiple images
- Ratings aggregation
- Owner (user who created)

### Category
- Managed from backend/admin
- Active/inactive status
- Ordering support

### Tag
- Reusable tags for listings
- Color and icon support

### Rating
- 1-5 star ratings
- One rating per user per listing
- Optional review text

### Comment
- Nested replies (parent/child)
- Soft delete
- Edit tracking
- Role badges

### CommentAttachment
- Images, videos, links
- File uploads
- Link previews

### Notification
- User notifications
- Email integration
- Read/unread status

## Testing

```bash
python manage.py test
```

## Production Deployment

1. Set `DEBUG=False` in `.env`
2. Configure proper database (PostgreSQL recommended)
3. Set up static files serving (WhiteNoise or CDN)
4. Configure proper email backend
5. Set up Redis for Celery
6. Configure CORS allowed origins
7. Use environment variables for secrets

## Admin Panel

Access at: `http://localhost:8000/admin/`

Login with superuser credentials created during setup.

## Troubleshooting

### Celery not working
- Ensure Redis is running: `redis-server`
- Check CELERY_BROKER_URL in settings

### Media files not serving
- Ensure `MEDIA_ROOT` and `MEDIA_URL` are configured
- Check file permissions

### CORS errors
- Add frontend URL to `CORS_ALLOWED_ORIGINS`
- Or set `CORS_ALLOW_ALL_ORIGINS=True` for development

### Email not sending
- Check email backend configuration
- For Gmail, use App Password (not regular password)
- Check spam folder

