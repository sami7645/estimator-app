#!/usr/bin/env python
"""
WSGI entry point for production (Render, gunicorn).
Run from repo root: gunicorn wsgi:application
"""
import os
import sys
from pathlib import Path

# Add backend/ to path so core and backend.settings can be found
_repo_root = Path(__file__).resolve().parent
_backend = _repo_root / "backend"
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

from django.core.wsgi import get_wsgi_application

application = get_wsgi_application()
