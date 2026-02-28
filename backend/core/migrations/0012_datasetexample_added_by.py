# Generated manually

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_added_by(apps, schema_editor):
    DatasetExample = apps.get_model("core", "DatasetExample")
    for ex in DatasetExample.objects.filter(added_by__isnull=True).select_related("plan_page__plan_set__project"):
        try:
            owner = ex.plan_page.plan_set.project.owner
            if owner:
                ex.added_by = owner
                ex.save(update_fields=["added_by"])
        except Exception:
            pass


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0011_subscription_business_plan"),
    ]

    operations = [
        migrations.AddField(
            model_name="datasetexample",
            name="added_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="dataset_examples_added",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(backfill_added_by, migrations.RunPython.noop),
    ]
