from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('comments', '0005_update_file_size_validator'),
    ]

    operations = [
        migrations.CreateModel(
            name='CommentFeedback',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('vote', models.CharField(choices=[('useful', 'Useful'), ('not_useful', 'Not useful')], max_length=16)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('comment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='feedbacks', to='comments.comment')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='comment_feedbacks', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'comment_feedbacks',
                'unique_together': {('comment', 'user')},
            },
        ),
        migrations.AddIndex(
            model_name='commentfeedback',
            index=models.Index(fields=['comment', 'vote'], name='comment_fee_comment_197eb0_idx'),
        ),
        migrations.AddIndex(
            model_name='commentfeedback',
            index=models.Index(fields=['user', 'updated_at'], name='comment_fee_user_id_10cb90_idx'),
        ),
    ]
