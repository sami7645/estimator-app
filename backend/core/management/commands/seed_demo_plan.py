"""
Seed a demo project with PLANS_FLOOR_1.pdf for all users (login/signup).
Uses pre-generated page images from repo so they're baked into the deploy (Render).
"""
import shutil
from pathlib import Path

from django.core.management.base import BaseCommand
from django.core.files.base import ContentFile
from django.conf import settings

from core.models import Project, PlanSet, PlanPage

REPO_ROOT = Path(settings.BASE_DIR).parent
SEED_PDF = REPO_ROOT / "seed_data" / "plans" / "pdfs" / "PLANS_FLOOR_1.pdf"
# Pre-generated page images (committed) - no PyMuPDF needed at build time
SEED_IMAGES = REPO_ROOT / "seed_data" / "plans" / "pages" / "1"

# DPI from zoom 2.0 (matches _generate_pages_for_plan_set)
ZOOM = 2.0
EFFECTIVE_DPI = 72.0 * ZOOM


class Command(BaseCommand):
    help = "Seed demo project with PLANS_FLOOR_1.pdf (uses pre-generated images from repo)"

    def handle(self, *args, **options):
        if not SEED_PDF.is_file():
            self.stderr.write(self.style.ERROR("Seed PDF not found: %s" % SEED_PDF))
            return
        if not SEED_IMAGES.is_dir():
            self.stderr.write(self.style.ERROR("Seed images not found: %s" % SEED_IMAGES))
            return

        # On Render, media is ephemeral. Recreate demo each run.
        existing = PlanSet.objects.filter(project__name="Demo Project").first()
        if existing:
            self.stdout.write("Removing existing demo...")
            existing.project.delete()

        self.stdout.write("Seeding demo from PLANS_FLOOR_1.pdf (pre-generated images)...")
        pdf_bytes = SEED_PDF.read_bytes()

        project = Project.objects.create(name="Demo Project", description="Pre-seeded floor plan for testing")
        plan_set = PlanSet.objects.create(project=project, name="Demo Plan Set")
        plan_set.pdf_file.save("PLANS_FLOOR_1.pdf", ContentFile(pdf_bytes), save=True)

        # Copy pre-generated images from repo to media (baked into deploy)
        media_root = Path(settings.MEDIA_ROOT)
        rel_dir = Path("plans") / "pages" / str(plan_set.id)
        abs_dir = media_root / rel_dir
        abs_dir.mkdir(parents=True, exist_ok=True)

        # Copy page_1.png, page_2.png, etc.) to media
        for img_path in sorted(SEED_IMAGES.glob("page_*.png")):
            shutil.copy2(img_path, abs_dir / img_path.name)

        # Create PlanPage records
        page_files = sorted(SEED_IMAGES.glob("page_*.png"))
        for i, img_path in enumerate(page_files, start=1):
            PlanPage.objects.create(
                plan_set=plan_set,
                page_number=i,
                image=str(rel_dir / img_path.name),
                title="",
                dpi_x=EFFECTIVE_DPI,
                dpi_y=EFFECTIVE_DPI,
            )

        self.stdout.write(self.style.SUCCESS("Demo plan seeded: %s (id=%s) with %s pages.") % (plan_set.name, plan_set.id, len(page_files)))
