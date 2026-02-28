"""
Serve the frontend SPA index.html for non-API routes (used in production).
"""
from django.conf import settings
from django.http import FileResponse, Http404
from pathlib import Path


def serve_spa(request, path):
    """Serve frontend index.html so the SPA router can handle the path."""
    index_path = settings.STATIC_ROOT / "index.html"
    if not index_path.exists():
        raise Http404("Frontend not built. Run the deploy build script.")
    return FileResponse(open(index_path, "rb"), content_type="text/html")
