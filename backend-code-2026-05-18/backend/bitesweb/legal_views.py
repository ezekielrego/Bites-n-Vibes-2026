from django.http import HttpResponse
from django.utils import timezone


def legal_page(request, page):
    is_privacy = page == 'privacy'
    title = 'Privacy Policy' if is_privacy else 'Terms of Service'
    body = PRIVACY_BODY if is_privacy else TERMS_BODY
    updated = timezone.now().strftime('%d %b %Y')
    html = f"""
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bites & Vibes - {title}</title>
    <style>
      body {{ margin: 0; background: #0a0d13; color: #f5f7fc; font-family: Arial, sans-serif; line-height: 1.6; }}
      main {{ max-width: 820px; margin: 0 auto; padding: 38px 18px 64px; }}
      h1 {{ font-size: 32px; margin: 0 0 8px; }}
      h2 {{ font-size: 18px; margin: 28px 0 8px; color: #ff6b3d; }}
      p, li {{ color: #cbd5e1; font-size: 15px; }}
      .card {{ border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.04); padding: 18px; border-radius: 18px; }}
      .muted {{ color: #94a3b8; font-size: 13px; }}
      a {{ color: #ff6b3d; }}
    </style>
  </head>
  <body>
    <main>
      <p class="muted">Bites & Vibes</p>
      <h1>{title}</h1>
      <p class="muted">Last updated {updated}</p>
      <div class="card">{body}</div>
    </main>
  </body>
</html>
"""
    return HttpResponse(html)


TERMS_BODY = """
<h2>Using the service</h2>
<p>Bites & Vibes helps users discover listings, events, bookings, reservations, tickets, and offers from hosts and businesses. You agree to provide accurate account, booking, and listing information.</p>
<h2>Bookings and payments</h2>
<p>Hosts may choose whether to accept internal payments. When internal payments are enabled, payments are processed through Paynow Zimbabwe Express Checkout and supported wallet providers. Confirmed bookings receive a unique reference and QR code.</p>
<h2>Host responsibilities</h2>
<p>Listing owners are responsible for accurate prices, availability, venue details, refund rules, and honoring valid confirmed references or QR codes.</p>
<h2>User responsibilities</h2>
<p>Users must not misuse QR codes, references, comments, media uploads, ratings, or account access. Fraudulent activity may result in cancellation or account restriction.</p>
<h2>Contact</h2>
<p>For support, contact <a href="mailto:accounts@bitesnvibes.co.zw">accounts@bitesnvibes.co.zw</a>.</p>
"""


PRIVACY_BODY = """
<h2>Information we collect</h2>
<p>We collect account details, profile details, listing activity, saved listings, tickets, bookings, comments, ratings, media uploads, payment references, and device notification preferences.</p>
<h2>Payments</h2>
<p>Payment prompts are handled by Paynow Zimbabwe and supported wallet providers. We store booking references, payment status, totals, and non-sensitive transaction metadata so users and owners can verify bookings.</p>
<h2>Location and recommendations</h2>
<p>When permission is granted, location may be used to improve nearby discovery and feed relevance. Users can deny or disable location access in device settings.</p>
<h2>Notifications</h2>
<p>We use in-app, email, and push notification preferences to send booking, ticket, comment, and account updates.</p>
<h2>Contact</h2>
<p>For privacy requests, contact <a href="mailto:accounts@bitesnvibes.co.zw">accounts@bitesnvibes.co.zw</a>.</p>
"""
