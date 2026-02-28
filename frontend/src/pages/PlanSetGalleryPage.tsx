import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { X, Eye } from 'lucide-react'
import type { PlanSet, PlanPage } from '../api'
import { fetchPlanSet, MEDIA_BASE } from '../api'
import './PlanSetGalleryPage.css'

export default function PlanSetGalleryPage() {
  const { planSetId: planSetIdParam } = useParams<{ planSetId: string }>()
  const planSetId = planSetIdParam ? parseInt(planSetIdParam, 10) : NaN
  const navigate = useNavigate()

  const [planSet, setPlanSet] = useState<PlanSet | null>(null)
  const [loading, setLoading] = useState(true)
  const [previewImage, setPreviewImage] = useState<PlanPage | null>(null)
  const [pages, setPages] = useState<PlanPage[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [loadedPlanSetId, setLoadedPlanSetId] = useState<number | null>(null)
  const [imagesReady, setImagesReady] = useState(false)
  const [thumbsLoaded, setThumbsLoaded] = useState(0)

  useEffect(() => {
    if (Number.isNaN(planSetId)) return

    // ensure we never flash old images when switching projects
    // and always show the loading animation for at least a short,
    // visible duration when navigating from /designer
    let cancelled = false
    const startTime = Date.now()

    setPlanSet(null)
    setPages([])
    setLoading(true)
    setLoadedPlanSetId(null)
    setImagesReady(false)
    setThumbsLoaded(0)

    void (async () => {
      try {
        const ps = await fetchPlanSet(planSetId)
        if (cancelled) return
        setPlanSet(ps)
        setPages(ps.pages || [])
        setLoadedPlanSetId(planSetId)
        // if there are no pages, there is nothing to wait for visually
        if (!ps.pages || ps.pages.length === 0) {
          setImagesReady(true)
        }
      } finally {
        if (cancelled) return
        const elapsed = Date.now() - startTime
        const minimumDuration = 500 // ms – guarantees the spinner is actually visible
        const remaining = Math.max(0, minimumDuration - elapsed)
        window.setTimeout(() => {
          if (cancelled) return
          setLoading(false)
        }, remaining)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [planSetId])

  function handleThumbLoaded(totalThumbs: number) {
    setThumbsLoaded((prev) => {
      const next = prev + 1
      if (next >= totalThumbs && totalThumbs > 0) {
        setImagesReady(true)
      }
      return next
    })
  }

  function handleThumbClick(page: PlanPage) {
    // if we just finished a drag, ignore click
    if (dragIndex !== null) return
    setPreviewImage(page)
  }

  function handleOpenInViewer() {
    if (!previewImage) return
    navigate(`/designer/plan-set/${planSetId}/view?page=${previewImage.id}`)
  }

  if (Number.isNaN(planSetId)) {
    return (
      <div className="gallery-page">
        <div className="gallery-loading">
          <div className="spinner" />
          <p>Invalid plan set.</p>
        </div>
        <button type="button" className="gallery-back-btn" onClick={() => navigate('/designer')}>
          ← Back to projects
        </button>
      </div>
    )
  }

  const effectivePages = pages.length && planSet ? pages : planSet?.pages || []
  const showOverlay = loading || !planSet || loadedPlanSetId !== planSetId || !imagesReady

  return (
    <div className="gallery-page">
      <div
        className={
          'gallery-loading-overlay' + (showOverlay ? '' : ' gallery-loading-overlay--hidden')
        }
      >
        <div className="gallery-loading-spinner">
          <div className="spinner" />
          <p>Loading drawings…</p>
        </div>
      </div>
      {planSet && (
        <main className="gallery-main">
          <section className="gallery-grid-section">
            <div className="gallery-grid">
              {effectivePages.map((page, index) => (
              <div
                key={page.id}
                className={`gallery-page-card${dragIndex === index ? ' dragging' : ''}`}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragIndex === null || dragIndex === index) {
                    setDragIndex(null)
                    return
                  }
                  const next = [...effectivePages]
                  const [moved] = next.splice(dragIndex, 1)
                  next.splice(index, 0, moved)
                  setPages(next)
                  setDragIndex(null)
                }}
                onDragEnd={() => setDragIndex(null)}
                onClick={() => handleThumbClick(page)}
              >
                <div className="gallery-thumb-wrapper">
                  <img
                    src={
                      page.image.startsWith('http')
                        ? page.image
                        : `${MEDIA_BASE}/${page.image}`
                    }
                    alt={page.title || `Page ${page.page_number}`}
                    loading="lazy"
                    decoding="async"
                    onLoad={() => handleThumbLoaded(effectivePages.length)}
                    onError={() => handleThumbLoaded(effectivePages.length)}
                  />
                </div>
                <div className="gallery-page-meta">
                  <div className="gallery-page-title">
                    <span className="gallery-page-index">Page {page.page_number}</span>
                  </div>
                </div>
              </div>
              ))}
            </div>
            <div className="gallery-sheet-count">{effectivePages.length} sheets</div>
          </section>
        </main>
      )}

      {previewImage && (
        <div className="gallery-preview-modal" onClick={() => setPreviewImage(null)}>
          <div className="gallery-preview-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="gallery-preview-close"
              onClick={() => setPreviewImage(null)}
              aria-label="Close preview"
            >
              <X size={24} />
            </button>
            <div className="gallery-preview-image-wrapper">
              <img
                src={
                  previewImage.image.startsWith('http')
                    ? previewImage.image
                    : `${MEDIA_BASE}/${previewImage.image}`
                }
                alt={previewImage.title || `Page ${previewImage.page_number}`}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="gallery-preview-actions">
              <button
                type="button"
                className="gallery-preview-viewer-btn"
                onClick={handleOpenInViewer}
              >
                <Eye size={18} />
                Open in Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
