import React from 'react'
import { Routes, Route } from 'react-router-dom'
import ProjectsPage from './pages/ProjectsPage'
import PlanViewerPage from './pages/PlanViewerPage'
import PlanSetGalleryPage from './pages/PlanSetGalleryPage'

export default function DesignerApp() {
  return (
    <div className="app-shell">
      <Routes>
        <Route index element={<ProjectsPage />} />
        <Route path="plan-set/:planSetId" element={<PlanSetGalleryPage />} />
        <Route path="plan-set/:planSetId/view" element={<PlanViewerPage />} />
      </Routes>
    </div>
  )
}
