# Estimator Tool - Togal.ai Alternative

A full-featured web application for construction estimators to upload PDF plans, add scale-based polygons and lines, manage ML datasets, and export results.

## Features

### ✅ Implemented

- **PDF Upload & Processing**: Upload PDF plan sets (1-250 pages), automatically split into per-page PNG images
- **Projects Page**: Separate page with project cards, filters, sorting, and search
- **Interactive Page List**: Left sidebar with clickable pages (left-click to load, right-click to open in new tab)
- **Plan Viewer**: Central viewer with zoom, pan, and scale calibration
- **Drawing Tools**:
  - **Each**: Place markers (square/circle/triangle) with single click
  - **Linear Feet**: Draw polylines with vertex editing
  - **Area & Perimeter**: Draw polygons with vertex editing, auto-calculate area/perimeter
- **Counts System**: 
  - Create count definitions with modal popup
  - Color picker with prime color presets
  - Shape selector for "Each" type
  - Trade selection (Acoustic, Electrical, Plumbing, etc.)
  - Expand/collapse count rows
  - Show/hide counts with eye icon
  - Right-click context menu for edit/delete
- **Vertex Editing**: Hover, drag, and delete vertices for polygons and polylines
- **Scale Calibration**: Bottom-left scale control with common scale dropdown
- **Keyboard Shortcuts**: ESC to deselect, Enter to close polygon, Backspace/Delete to remove items
- **Pan Mode**: Space + left-click + drag for panning
- **Add to Dataset**: Button to add counted pages to ML dataset per trade
- **Excel Export**: Export all counts to Excel spreadsheet
- **ML Detection Stub**: Wired but returns 0 detections (ready for model integration)

## Tech Stack

- **Backend**: Django 6.0 + Django REST Framework
- **Frontend**: React 18 + TypeScript + Vite
- **Drawing**: Konva.js (react-konva) for canvas drawing
- **Database**: SQLite (development)
- **File Storage**: Local media folder (development)

## Setup Instructions

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm or yarn

### Backend Setup

1. Navigate to project directory:
   ```bash
   cd "D:\DEV ai\training"
   ```

2. Create and activate virtual environment:
   ```bash
   python -m venv venv
   .\venv\Scripts\activate  # Windows
   # or: source venv/bin/activate  # Linux/Mac
   ```

3. Install dependencies:
   ```bash
   .\venv\Scripts\pip install django djangorestframework pillow pymupdf openpyxl django-cors-headers
   ```

4. Run migrations:
   ```bash
   .\venv\Scripts\python backend\manage.py migrate
   ```

5. Create superuser (optional, for admin access):
   ```bash
   .\venv\Scripts\python backend\manage.py createsuperuser
   ```

6. Start Django server:
   ```bash
   .\venv\Scripts\python backend\manage.py runserver
   ```

   Backend will run on `http://localhost:8000`

### Frontend Setup

1. Navigate to frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

   Frontend will run on `http://localhost:5173`

## Usage

1. **Create a Project**: Click "New Project" button, enter project name and plan set name, upload PDF
2. **View Plans**: Click on a project card to open the plan viewer
3. **Navigate Pages**: Click pages in the left sidebar to switch between pages
4. **Create Counts**: Click "+" button in right sidebar, fill out count definition form
5. **Draw Counts**: 
   - Select a count definition to activate it
   - Click on the plan to place markers (Each) or start drawing (Linear/Area)
   - For polygons: Click vertices, press Enter or double-click to close
   - For polylines: Click vertices, press ESC or double-click to finish
6. **Edit Vertices**: Hover over vertices to see them darken, drag to move, Shift+click to drag
7. **Scale Calibration**: Click "Calibrate" in bottom-left, select scale and enter pixel distance
8. **Export**: Click export button in toolbar to download Excel file with all counts

## API Endpoints

- `GET /api/projects/` - List projects
- `POST /api/projects/` - Create project
- `GET /api/plan-sets/` - List plan sets
- `POST /api/plan-sets/` - Upload PDF plan set
- `GET /api/count-definitions/` - List count definitions
- `POST /api/count-definitions/` - Create count definition
- `GET /api/count-items/` - List count items
- `POST /api/count-items/` - Create count item
- `POST /api/pages/{id}/add_to_dataset/` - Add page to dataset
- `GET /api/detections/export_counts_excel/` - Export Excel

## Project Structure

```
project-root/
├── backend/              # Django project
│   ├── backend/         # Django settings (wsgi, urls)
│   ├── core/            # Django app (models, views, serializers)
│   └── manage.py
├── frontend/            # React frontend
├── wsgi.py              # Production WSGI entry (Render/gunicorn)
│   ├── src/
│   │   ├── pages/       # Page components
│   │   ├── components/  # Reusable components
│   │   └── api.ts      # API client
│   └── package.json
├── media/              # Uploaded files (PDFs, images)
└── venv/               # Python virtual environment
```

## Next Steps / Future Enhancements

- [ ] ML model integration for auto-detection
- [ ] PDF export with annotations overlay
- [ ] User authentication and multi-user support
- [ ] Real-time collaboration
- [ ] Advanced filtering and search
- [ ] Dataset management UI
- [ ] ML training pipeline
- [ ] Production deployment setup

## Notes

- Currently uses local file storage (media folder) - can be switched to S3 later
- ML detection is stubbed (returns empty array) - ready for model integration
- Scale calibration uses simple pixel-to-feet conversion
- All coordinates stored as normalized [0,1] values for device independence
