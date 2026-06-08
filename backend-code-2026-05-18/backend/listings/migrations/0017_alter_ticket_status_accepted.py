from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('listings', '0016_appversionpolicy'),
    ]

    operations = [
        migrations.AlterField(
            model_name='ticket',
            name='status',
            field=models.CharField(
                choices=[
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
