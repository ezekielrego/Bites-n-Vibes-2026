import hashlib
from decimal import Decimal
from urllib.parse import parse_qs, urlencode
from urllib.request import Request, urlopen

from django.conf import settings


SUCCESS_STATUSES = {'paid', 'awaiting delivery', 'delivered'}
FAILED_STATUSES = {'cancelled', 'failed', 'disputed', 'refunded', 'expired'}


class PaynowError(Exception):
    """Raised when Paynow cannot start or check an Express Checkout payment."""


class PaynowClient:
    """Small Paynow Express Checkout adapter without forcing an extra package."""

    def __init__(self):
        self.integration_id = settings.PAYNOW_INTEGRATION_ID
        self.integration_key = settings.PAYNOW_INTEGRATION_KEY
        self.enabled = settings.PAYNOW_ENABLED
        self.test_mode = settings.PAYNOW_TEST_MODE

    def begin_express_checkout(self, *, reference, amount, email, phone, method, description):
        if self.test_mode or not self.enabled:
            return {
                'status': 'paid',
                'pollurl': '',
                'browserurl': '',
                'paynowreference': f'TEST-{reference}',
                'raw': {'status': 'Paid', 'test_mode': True},
            }

        if not self.integration_id or not self.integration_key:
            raise PaynowError('Payment service is not configured yet.')

        payload = {
            'id': self.integration_id,
            'reference': reference,
            'amount': self._format_amount(amount),
            'additionalinfo': description,
            'returnurl': settings.PAYNOW_RETURN_URL,
            'resulturl': settings.PAYNOW_RESULT_URL,
            'authemail': email,
            'authphone': phone,
            'merchanttrace': reference[:32],
            'method': method,
            'phone': phone,
            'status': 'Message',
        }
        payload['hash'] = self._hash(payload)
        response = self._post_form(settings.PAYNOW_EXPRESS_URL, payload)

        if self._normalize_status(response.get('status')) in FAILED_STATUSES:
            raise PaynowError(response.get('error') or 'Payment could not be started.')

        return {
            'status': self._normalize_status(response.get('status', 'pending')),
            'pollurl': response.get('pollurl', ''),
            'browserurl': response.get('browserurl', ''),
            'paynowreference': response.get('paynowreference', ''),
            'raw': response,
        }

    def poll(self, poll_url):
        if self.test_mode or not self.enabled:
            return {'status': 'paid', 'raw': {'status': 'Paid', 'test_mode': True}}

        if not poll_url:
            raise PaynowError('Payment status is not ready yet.')

        response = self._post_form(poll_url, {})
        return {
            'status': self._normalize_status(response.get('status', 'pending')),
            'raw': response,
        }

    def _post_form(self, url, payload):
        encoded = urlencode(payload).encode('utf-8')
        request = Request(url, data=encoded, headers={'Content-Type': 'application/x-www-form-urlencoded'})
        with urlopen(request, timeout=25) as response:
            body = response.read().decode('utf-8')

        parsed = parse_qs(body, keep_blank_values=True)
        return {key.lower(): values[-1] if values else '' for key, values in parsed.items()}

    def _hash(self, payload):
        values = ''.join(str(value).strip() for key, value in payload.items() if key.lower() != 'hash')
        return hashlib.sha512(f'{values}{self.integration_key}'.encode('utf-8')).hexdigest().upper()

    def _format_amount(self, amount):
        return f'{Decimal(amount).quantize(Decimal("0.01"))}'

    def _normalize_status(self, status):
        return str(status or 'pending').strip().lower()
