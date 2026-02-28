# Generated manually: add is_starred and is_archived to Project

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_contactmessage"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="is_starred",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="project",
            name="is_archived",
            field=models.BooleanField(default=False),
        ),
    ]

