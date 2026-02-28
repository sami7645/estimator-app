# Deploy to Render

This guide walks you through deploying the Estimator app (Django + React) on Render using **one Web Service** and **one Postgres database**.

## What You’ll Use on Render

From the “Create a new Service” page:

1. **Web Service** – Runs the Django backend and serves the built React frontend (single app URL).
2. **Postgres** – Database (created and linked automatically via the Blueprint).

You do **not** need: Static Site, Private Service, Worker, Cron, or Key Value for this setup.

---

## Option A: Deploy with Blueprint (recommended)

### 1. Push the repo to GitHub

Make sure your project is in a Git repo and pushed to GitHub (or GitLab). The repo root should contain `render.yaml`, `build.sh`, `backend/`, and `frontend/`.

### 2. Connect the repo in Render

1. Go to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** → **Blueprint**.
3. Connect your GitHub/GitLab account if needed and select the repository that contains this project.
4. Render will detect `render.yaml` in the root. Confirm the file and click **Apply**.

### 3. Create the resources

1. Render will create:
   - **Postgres** database: `estimator-db`
   - **Web Service**: `estimator-app`
2. The first deploy will run automatically. It will:
   - Install Python deps, install Node, build the frontend, run `collectstatic`, then start Gunicorn.
   - Run migrations in the **pre-deploy** step.

### 4. Open the app

When the deploy succeeds, open the URL shown for `estimator-app` (e.g. `https://estimator-app-xxxx.onrender.com`). You should see the app; the same URL serves both the React UI and the `/api/` backend.

### 5. (Optional) Create a superuser

In the Render shell for `estimator-app`:

```bash
python backend/manage.py createsuperuser
```

Or run this locally pointing at production `DATABASE_URL` (only if you have it and it’s safe):

```bash
DATABASE_URL='postgres://...' python backend/manage.py createsuperuser
```

---

## Option B: Manual setup (without Blueprint)

If you prefer to create the services by hand:

### 1. Create a Postgres database

1. **New +** → **Postgres**.
2. Name it e.g. `estimator-db`, choose a plan (e.g. Free).
3. Create the database and note the **Internal Database URL** (or **External** if you need it for local access).

### 2. Create a Web Service

1. **New +** → **Web Service**.
2. Connect the repo and select this project (root with `backend/`, `frontend/`, `build.sh`).
3. Settings:
   - **Runtime:** Python 3.
   - **Build Command:** `chmod +x build.sh && ./build.sh`
   - **Start Command:** `gunicorn wsgi:application --bind 0.0.0.0:$PORT`
   - **Pre-Deploy Command (optional but recommended):** `python backend/manage.py migrate --noinput`
4. **Environment:**
   - `SECRET_KEY` – Generate or set a long random string.
   - `DEBUG` – `false`
   - `ALLOWED_HOSTS` – `.onrender.com` (or your custom domain later).
   - `DATABASE_URL` – From the Postgres service: **Connect** → **Internal Database URL** (or copy the connection string).
5. Save and deploy.

### 3. Health check

Set **Health Check Path** to `/api/health/` so Render can detect a healthy app.

---

## Project layout (for reference)

The repo is arranged so the same repo works for local dev and Render:

- **Root:** `build.sh`, `render.yaml`, `wsgi.py`, `DEPLOY.md`
- **backend/** – Django project (`manage.py`, `backend/settings.py`, `backend/urls.py`, `backend/wsgi.py`, `core/` app)
- **frontend/** – React + Vite app; built output is copied into `backend/staticfiles/` during the build and served by Django + WhiteNoise

Build steps (in `build.sh`):

1. Install Python dependencies from `backend/requirements.txt`.
2. Install Node if missing, then build the frontend with `VITE_API_BASE=/api` and `VITE_MEDIA_BASE=/media`.
3. Copy `frontend/dist/*` to `backend/staticfiles/`.
4. Run `python backend/manage.py collectstatic --noinput`.

---

## Media files (uploads)

Render’s filesystem is **ephemeral**: uploads (PDFs, plan images) are lost on redeploy. For production you can:

- Add a **Persistent Disk** in Render and set `MEDIA_ROOT` to the mount path, or
- Use object storage (e.g. S3) and `django-storages` with a bucket.

The app will run without either; only file uploads won’t persist across deploys until you add one of these.

---

## Troubleshooting

- **Build fails on “node: command not found”**  
  The script installs Node when missing. If it still fails, check the build logs for the Node install step and any path/arch issues.

- **500 or “Frontend not built”**  
  Ensure the build completed and `backend/staticfiles/index.html` exists (created by `collectstatic`). Re-deploy and check the build logs.

- **Database errors**  
  Confirm `DATABASE_URL` is set and points to the Postgres instance. Run migrations: Pre-Deploy Command `python backend/manage.py migrate --noinput` or manually in the shell.

- **Static/API/redirect issues**  
  The app serves the SPA for all non-API, non-admin, non-static, non-media paths. Ensure `ALLOWED_HOSTS` includes your Render host (e.g. `.onrender.com`).
