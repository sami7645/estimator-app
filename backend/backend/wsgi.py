"""
WSGI config for backend project.

For production, use the root-level wsgi.py: gunicorn wsgi:application
This file is kept for Django's runserver and other tooling.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

application = get_wsgi_application()
