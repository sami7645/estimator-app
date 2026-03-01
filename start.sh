#!/usr/bin/env bash
# Render start script - ensures PORT is set and gunicorn binds correctly
set -e
export PORT="${PORT:-10000}"
echo "Starting gunicorn on 0.0.0.0:$PORT"
exec gunicorn wsgi:application --bind "0.0.0.0:$PORT" --workers 1 --timeout 120
