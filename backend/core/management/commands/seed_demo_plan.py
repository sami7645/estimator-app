"""
Seed a demo project with PLANS_FLOOR_1.pdf for all users (login/signup).
Available from the start in the designer. Baked into each deploy for Render.
"""
import fitz
from pathlib import Path

from django.core.management.base import BaseCommand
from django.core.files.base import ContentFile
from django.conf import settings

from core.models import Project, PlanSet, PlanPage

# Repo path: seed_data/plans/pdfs/PLANS_FLOOR_1.pdf (committed floor plan PDF)
SEED_PDF = Path(settings.BASE_DIR).parent / "seed_data" / "plans" / "pdfs" / "PLANS_FLOOR_1.pdf"


class Command(BaseCommand):
    help = "Seed demo project with PLANS_FLOOR_1.pdf for all accounts (available after login/signup)"

    def handle(self, *args, **options):
        if not SEED_PDF.is_file():
            self.stderr.write(self.style.ERROR("Seed PDF not found: %s" % SEED_PDF))
            return

        # On Render, media is ephemeral: files are lost on redeploy. Recreate demo each run.
        existing = PlanSet.objects.filter(project__name="Demo Project").first()
        if existing:
            self.stdout.write("Removing existing demo (media is ephemeral on redeploy)...")
            existing.project.delete()  # CASCADE deletes plan_set and pages

        self.stdout.write("Seeding demo from PLANS_FLOOR_1.pdf...")
        pdf_bytes = SEED_PDF.read_bytes()

        project = Project.objects.create(name="Demo Project", description="Pre-seeded floor plan for testing")
        plan_set = PlanSet.objects.create(project=project, name="Demo Plan Set")
        plan_set.pdf_file.save("PLANS_FLOOR_1.pdf", ContentFile(pdf_bytes), save=True)

        # Generate page images (same logic as _generate_pages_for_plan_set)
        media_root = Path(settings.MEDIA_ROOT)
        zoom_x, zoom_y = 2.0, 2.0
        effective_dpi_x = 72.0 * zoom_x
        effective_dpi_y = 72.0 * zoom_y

        doc = fitz.open(plan_set.pdf_file.path)
        for page_index in range(len(doc)):
            page = doc.load_page(page_index)
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom_x, zoom_y))
            rel_dir = Path("plans") / "pages" / str(plan_set.id)
            abs_dir = media_root / rel_dir
            abs_dir.mkdir(parents=True, exist_ok=True)
            filename = f"page_{page_index + 1}.png"
            abs_path = abs_dir / filename
            pix.save(abs_path.as_posix())

            PlanPage.objects.create(
                plan_set=plan_set,
                page_number=page_index + 1,
                image=str(rel_dir / filename),
                title="",
                dpi_x=effective_dpi_x,
                dpi_y=effective_dpi_y,
            )
        doc.close()

        num_pages = PlanPage.objects.filter(plan_set=plan_set).count()
        self.stdout.write(self.style.SUCCESS("Demo plan seeded: %s (id=%s) with %s pages.") % (plan_set.name, plan_set.id, num_pages))
