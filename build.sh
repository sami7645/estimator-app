#!/usr/bin/env bash
# Render build script: run from repo root.
set -e

echo "==> Installing Python dependencies..."
pip install -r backend/requirements.txt

# Install Node for frontend build if not present (e.g. on Render Python runtime)
if ! command -v node &>/dev/null; then
  echo "==> Installing Node.js for frontend build..."
  NODE_VER="20.18.0"
  ARCH="$(uname -m)"; case "$ARCH" in x86_64) ARCH="x64";; aarch64|arm64) ARCH="arm64";; *) ARCH="x64";; esac
  curl -sSf "https://nodejs.org/dist/v${NODE_VER}/node-v${NODE_VER}-linux-${ARCH}.tar.xz" | tar -xJ -C /tmp
  export PATH="/tmp/node-v${NODE_VER}-linux-${ARCH}/bin:$PATH"
fi
echo "==> Node version: $(node -v 2>/dev/null || echo 'not found')"

echo "==> Building frontend..."
cd frontend
npm ci
VITE_API_BASE=/api VITE_MEDIA_BASE=/media npm run build
cd ..

echo "==> Copying frontend build into backend staticfiles..."
mkdir -p backend/staticfiles
cp -r frontend/dist/* backend/staticfiles/

echo "==> Running Django collectstatic..."
python backend/manage.py collectstatic --noinput

echo "==> Build complete. (Migrations run via preDeployCommand on Render)"

echo "==> Build complete."
