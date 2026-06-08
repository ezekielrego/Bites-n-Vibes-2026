# Bites n Vibes Backend Hosting

Target API base: `https://bitesnvibes.co.zw/api`

## Upload

Upload the zipped backend contents to the Python app directory on the host. The zip intentionally excludes:

- `.env`
- `media/`
- `db.sqlite3`
- `.venv/`
- `__pycache__/`
- local Firebase service account JSON files

## Environment

Copy `.env.production.example` to `.env` on the server and fill the real values for:

- `SECRET_KEY`
- database credentials
- email password
- Google OAuth credentials
- Paynow credentials, if enabled
- Firebase credentials, if push is enabled

For the Expo app, use:

```bash
EXPO_PUBLIC_BACKEND_ORIGIN=https://bitesnvibes.co.zw
```

The app builds API URLs as `https://bitesnvibes.co.zw/api/...`.

## First Run

```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py createsuperuser
```

If the host uses Passenger or cPanel Python apps, `passenger_wsgi.py` is already included.
