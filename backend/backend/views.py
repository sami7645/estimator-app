"""
Serve the frontend SPA index.html for non-API routes (used in production).
Serve media with fallback to static for demo images (Render ephemeral disk).
"""
import re
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.views.static import serve as static_serve


def serve_media(request, path):
    """
    Serve media files. If not found, fall back to static demo images.
    On Render, media/ is ephemeral; demo images are baked into staticfiles/.
    """
    media_path = Path(settings.MEDIA_ROOT) / path
    if media_path.is_file():
        return static_serve(request, path, document_root=settings.MEDIA_ROOT)

    # Fallback: plans/pages/X/page_N.png -> static/demo/plans/pages/1/page_N.png
    match = re.match(r"^plans/pages/\d+/page_(\d+)\.png$", path)
    if match:
        demo_path = Path(settings.STATIC_ROOT) / "demo" / "plans" / "pages" / "1" / f"page_{match.group(1)}.png"
        if demo_path.is_file():
            with open(demo_path, "rb") as f:
                return HttpResponse(f.read(), content_type="image/png")

    raise Http404("File not found")


def serve_spa(request, path=""):
    """Serve frontend index.html so the SPA router can handle the path."""
    index_path = settings.STATIC_ROOT / "index.html"
    if not index_path.exists():
        raise Http404("Frontend not built. Run the deploy build script.")
    return FileResponse(open(index_path, "rb"), content_type="text/html")
