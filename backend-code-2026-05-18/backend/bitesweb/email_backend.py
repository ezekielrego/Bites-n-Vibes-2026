"""
Custom email backend that handles self-signed SSL certificates.
"""
import ssl
import smtplib
from django.core.mail.backends.smtp import EmailBackend


class SSLEmailBackend(EmailBackend):
    """
    Custom email backend that creates an unverified SSL context
    for servers with self-signed certificates.
    """
    
    def open(self):
        if self.connection:
            return False
        
        try:
            self.connection = smtplib.SMTP(
                self.host, self.port,
                timeout=self.timeout
            )
            
            # Create unverified SSL context for self-signed certs
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            
            if self.use_tls:
                self.connection.starttls(context=context)
            
            if self.username and self.password:
                self.connection.login(self.username, self.password)
            
            return True
        except (smtplib.SMTPException, OSError):
            if not self.fail_silently:
                raise
            return False
