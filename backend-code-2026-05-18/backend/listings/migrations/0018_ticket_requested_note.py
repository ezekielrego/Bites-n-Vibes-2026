from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('listings', '0017_alter_ticket_status_accepted'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='request_note',
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name='ticket',
            name='status',
            field=models.CharField(
                choices=[
                    ('requested', 'Requested'),
                    ('pending', 'Pending Payment'),
                    ('confirmed', 'Confirmed'),
                    ('accepted', 'Accepted / Reserved'),
                    ('used', 'Used'),
                    ('cancelled', 'Cancelled'),
                    ('failed', 'Payment Failed'),
                    ('expired', 'Expired'),
                ],
                default='confirmed',
                max_length=16,
            ),
        ),
    ]
