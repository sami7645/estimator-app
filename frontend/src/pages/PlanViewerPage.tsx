import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { flushSync } from 'react-dom'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Menu, Keyboard as KeyboardIcon, X as CloseIcon, FileDown, FileSpreadsheet, Check, Loader2, AlertCircle } from 'lucide-react'
import type { PlanSet, PlanPage, CountDefinition, CountItem, AutoDetectResult } from '../api'
import { fetchPlanSet, fetchCountDefinitions, fetchCountItems, fetchScaleCalibration, deleteCountItem, createCountItem, updateCountItem, uploadPlanPageAlt, renamePlanPageExtraImage, deletePlanPageExtraImage, MEDIA_BASE } from '../api'
import { exportPlanAsPdf } from '../utils/exportPlanPdf'
import CountsPanel from '../components/CountsPanel'
import ViewerCanvas from '../components/ViewerCanvas'
import Toolbar, { type SaveStatus } from '../components/Toolbar'
import PagesSidebar, { type PagesViewMode } from '../components/PagesSidebar'
import ExcelPreviewModal from '../components/ExcelPreviewModal'
import { PanelLeftClose, PanelLeft } from 'lucide-react'
import { exportCountsExcel } from '../api'
import './PlanViewerPage.css'

// Thumbnail cache
const thumbnailCache = new Map<string, string>()

async function generateLowQualityThumbnail(imageUrl: string): Promise<string> {
  if (thumbnailCache.has(imageUrl)) {
    return thumbnailCache.get(imageUrl)!
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 512
        canvas.height = 340
        const ctx = canvas.getContext('2d', {
          willReadFrequently: false,
          alpha: false,
        })

        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        thumbnailCache.set(imageUrl, dataUrl)
        resolve(dataUrl)
      } catch (err) {
        reject(err)
      }
    }

    img.onerror = () => {
      reject(new Error('Failed to load image'))
    }

    img.src = imageUrl
  })
}

export default function PlanViewerPage() {
  const { planSetId: planSetIdParam } = useParams<{ planSetId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const planSetId = planSetIdParam ? parseInt(planSetIdParam, 10) : NaN
  const initialPageId = searchParams.get('page')
    ? parseInt(searchParams.get('page')!, 10)
    : undefined
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [planSet, setPlanSet] = useState<PlanSet | null>(null)
  const [selectedPage, setSelectedPage] = useState<PlanPage | null>(null)
  const [countDefinitions, setCountDefinitions] = useState<CountDefinition[]>([])
  const [countItems, setCountItems] = useState<CountItem[]>([])
  const [activeCountId, setActiveCountId] = useState<number | null>(null)
  const [fitZoom, setFitZoom] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [baselineReady, setBaselineReady] = useState(false)
  const [panMode, setPanMode] = useState(false)
  const [countsVisible, setCountsVisible] = useState(true)
  const [hiddenCountIds, setHiddenCountIds] = useState<Set<number>>(new Set())
  const [scale, setScale] = useState({ realWorldFeet: 1, pixelDistance: 100 })
  const [isCalibrated, setIsCalibrated] = useState(false)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [calibrationPixelDist, setCalibrationPixelDist] = useState<number | null>(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [rotation, setRotation] = useState(0)
  const [history, setHistory] = useState<CountItem[][]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const historyIndexRef = useRef(-1)
  const viewerRef = useRef<HTMLDivElement>(null)
  const imageRegionRef = useRef<HTMLDivElement>(null)
  const lastCalibrationScaleRef = useRef<{ realWorldFeet: number; pixelDistance: number } | null>(null)
  const countItemsRef = useRef<CountItem[]>([])
  const handleCountItemUpdatedRef = useRef<((item: CountItem) => void) | null>(null)
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<number, string>>(new Map())
  const [isDrawing, setIsDrawing] = useState(false)
  const [pagesSidebarVisible, setPagesSidebarVisible] = useState(true)
  const [exportPdfLoading, setExportPdfLoading] = useState(false)
  const [exportPdfProgress, setExportPdfProgress] = useState<{ current: number; total: number } | null>(null)
  const [exportPdfModalOpen, setExportPdfModalOpen] = useState(false)
  const [exportPdfSelectedPageIds, setExportPdfSelectedPageIds] = useState<Set<number>>(new Set())
  const [exportPdfFilterWithContentOnly, setExportPdfFilterWithContentOnly] = useState(false)
  const [exportPdfAllCountItems, setExportPdfAllCountItems] = useState<CountItem[]>([])
  const [pagesViewMode, setPagesViewMode] = useState<PagesViewMode>('images')
  const [excelModalOpen, setExcelModalOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [noteMode, setNoteMode] = useState(false)
  const [noteColor, setNoteColor] = useState('#fef08a')
  const [eraseMode, setEraseMode] = useState(false)
  const [notes, setNotes] = useState<Map<number, { id: string; x: number; y: number; text: string; color: string }[]>>(new Map())
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteDraft, setEditingNoteDraft] = useState<string>('')
  const [pendingNotePos, setPendingNotePos] = useState<{ x: number; y: number } | null>(null)
  const [noteEditorDragging, setNoteEditorDragging] = useState(false)
  const [noteEditorDragPosition, setNoteEditorDragPosition] = useState<{ x: number; y: number } | null>(null)
  /** Which background image to show: plan (primary) or satellite (secondary, same scale). */
  const [backgroundView, setBackgroundView] = useState<'plan' | 'satellite'>('plan')
  /** When satellite view: which extra image is shown ('alt' = image_alt, number = overlay id). */
  const [activeExtraImageId, setActiveExtraImageId] = useState<'alt' | number | null>(null)
  const [uploadAltLoading, setUploadAltLoading] = useState(false)
  const uploadAltInputRef = useRef<HTMLInputElement>(null)
  const selectedPageIdRef = useRef<number | null>(null)
  const noteEditorDragRef = useRef<{
    startClientX: number
    startClientY: number
    startNX: number
    startNY: number
    currentNX: number
    currentNY: number
    isNew: boolean
    noteId?: string
  } | null>(null)
  const [selectedCountIds, setSelectedCountIds] = useState<Set<number>>(new Set())
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [noteDraggingId, setNoteDraggingId] = useState<string | null>(null)
  const [noteDragPosition, setNoteDragPosition] = useState<{ x: number; y: number } | null>(null)
  const noteCardDragRef = useRef<{ noteId: string; startClientX: number; startClientY: number; startNX: number; startNY: number; currentNX: number; currentNY: number } | null>(null)

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSavesRef = useRef(0)
  const savingStartedRef = useRef<number>(0)
  const SAVE_SHOW_SAVED_MS = 2500
  const SAVE_MIN_SAVING_MS = 400

  const notesLoadedForPlanRef = useRef<number | null>(null)
  const notesSaveFirstRunForPlanRef = useRef<number | null>(null)

  // Load notes from localStorage when plan set changes (exact position + text per page)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (Number.isNaN(planSetId)) return
    const key = `plan-notes:v1:${planSetId}`
    try {
      const raw = window.localStorage.getItem(key)
      const map = new Map<number, { id: string; x: number; y: number; text: string; color: string }[]>()
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, { id: string; x: number; y: number; text: string; color: string }[]>
        Object.entries(obj).forEach(([pageId, arr]) => {
          map.set(Number(pageId), arr)
        })
      }
      setNotes(map)
      notesLoadedForPlanRef.current = planSetId
    } catch {
      notesLoadedForPlanRef.current = planSetId
    }
  }, [planSetId])

  // Save notes to localStorage (exact position + text). Skip first effect run per plan so we don't overwrite before load.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (Number.isNaN(planSetId)) return
    if (notesLoadedForPlanRef.current !== planSetId) return
    if (notesSaveFirstRunForPlanRef.current !== planSetId) {
      notesSaveFirstRunForPlanRef.current = planSetId
      return
    }
    const key = `plan-notes:v1:${planSetId}`
    const obj: Record<string, { id: string; x: number; y: number; text: string; color: string }[]> = {}
    notes.forEach((value, pageId) => {
      obj[String(pageId)] = value
    })
    try {
      window.localStorage.setItem(key, JSON.stringify(obj))
    } catch {
      // ignore quota errors
    }
  }, [notes, planSetId])

  // Ref for instant isDrawing check (avoids stale closure in keyboard handler)
  const isDrawingRef = useRef(false)
  const handleDrawingStateChange = useCallback((drawing: boolean) => {
    isDrawingRef.current = drawing
    setIsDrawing(drawing)
  }, [])

  // Preserve viewport position during zoom (null = center, {x,y} = restore fraction)
  const scrollFractionRef = useRef<{ x: number; y: number } | null>(null)

  // Per-page undo history persistence across page switches
  const pageHistoryRef = useRef<Map<number, { history: CountItem[][]; historyIndex: number }>>(new Map())

  // Vertex-level undo/redo refs (set by ViewerCanvas)
  const vertexUndoRef = useRef<(() => void) | null>(null)
  const vertexRedoRef = useRef<(() => void) | null>(null)
  const hasVertexRedoRef = useRef<() => boolean>(() => false)
  const resetDrawingRef = useRef<(() => void) | null>(null)

  // Signal ViewerCanvas to reopen a shape for editing (undo after finishing)
  const [reopenDrawing, setReopenDrawing] = useState<{
    type: 'drawing_polyline' | 'drawing_polygon'
    vertices: number[][]
    redoStack?: number[][]
  } | null>(null)

  const ZOOM_LEVELS = [
    0.1, 0.125, 0.15, 0.2, 0.25, 0.33, 0.4, 0.5, 0.67, 0.75, 1, 1.1, 1.25,
    1.5, 1.75, 2, 2.5, 3, 4, 5,
  ] as const

  function nextZoomLevel(current: number, direction: 'in' | 'out'): number {
    if (direction === 'in') {
      for (let i = 0; i < ZOOM_LEVELS.length; i++) {
        if (ZOOM_LEVELS[i] > current + 1e-6) return ZOOM_LEVELS[i]
      }
      return ZOOM_LEVELS[ZOOM_LEVELS.length - 1]
    } else {
      for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
        if (ZOOM_LEVELS[i] < current - 1e-6) return ZOOM_LEVELS[i]
      }
      return ZOOM_LEVELS[0]
    }
  }

  /* ─── ESC to deselect active count / cancel calibration, T for note mode ─── */

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      if (e.key === 'Escape') {
        if (pendingNotePos || editingNoteId) {
          handleNoteDismiss()
        } else if (noteMode) {
          setNoteMode(false)
        } else if (isCalibrating) {
          setIsCalibrating(false)
          setCalibrationPixelDist(null)
        } else {
          setActiveCountId(null)
        }
      }
      // T or Ctrl+T / Cmd+T: toggle note mode (like Togal AI — T to add note, T again to close and go back to select)
      if ((e.key === 't' || e.key === 'T') && (!e.ctrlKey && !e.metaKey)) {
        e.preventDefault()
        setNoteMode(prev => !prev)
        if (!noteMode) { setPanMode(false); setEraseMode(false) }
      }
      if ((e.key === 'e' || e.key === 'E') && (!e.ctrlKey && !e.metaKey)) {
        e.preventDefault()
        setEraseMode(prev => !prev)
        if (!eraseMode) setPanMode(false)
        else setNoteMode(false)
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 't' || e.key === 'T')) {
        e.preventDefault()
        e.stopPropagation()
        setNoteMode(prev => !prev)
        if (!noteMode) setPanMode(false)
      }
      const delta = 0.008
      if (selectedNoteId && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const pageNotes = selectedPage ? notes.get(selectedPage.id) || [] : []
        const note = pageNotes.find((n) => n.id === selectedNoteId)
        if (note) {
          e.preventDefault()
          let nx = note.x
          let ny = note.y
          if (e.key === 'ArrowLeft') nx -= delta
          else if (e.key === 'ArrowRight') nx += delta
          else if (e.key === 'ArrowUp') ny -= delta
          else if (e.key === 'ArrowDown') ny += delta
          nx = Math.max(0, Math.min(1, nx))
          ny = Math.max(0, Math.min(1, ny))
          handleNoteMoved(note.id, nx, ny)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isCalibrating, noteMode, eraseMode, selectedNoteId, selectedPage, notes])

  /* ─── Save tracking ─── */

  function markSaving() {
    pendingSavesRef.current++
    savingStartedRef.current = Date.now()
    setSaveStatus('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }

  function markSaved() {
    pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1)
    if (pendingSavesRef.current === 0) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      const elapsed = Date.now() - savingStartedRef.current
      const delayBeforeSaved = Math.max(0, SAVE_MIN_SAVING_MS - elapsed)
      saveTimerRef.current = setTimeout(() => {
        setSaveStatus('saved')
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), SAVE_SHOW_SAVED_MS)
      }, delayBeforeSaved)
    }
  }

  function markSaveError() {
    pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1)
    setSaveStatus('error')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (pendingSavesRef.current === 0) setSaveStatus('idle')
    }, 5000)
  }

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (pendingSavesRef.current > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  /* ─── Data loading ─── */

  useEffect(() => {
    if (Number.isNaN(planSetId)) return
    loadPlanSet()
  }, [planSetId])

  useEffect(() => {
    if (selectedPage?.id != null) selectedPageIdRef.current = selectedPage.id
  }, [selectedPage?.id])

  useEffect(() => {
    if (planSet) {
      loadCountDefinitions()
      if (planSet.pages && planSet.pages.length > 0) {
        const preserveId = selectedPageIdRef.current
        const initial =
          (preserveId && planSet.pages.find((p) => p.id === preserveId)) ||
          (initialPageId && planSet.pages.find((p) => p.id === initialPageId)) ||
          planSet.pages[0]
        setSelectedPage(initial)

        const newThumbnailUrls = new Map<number, string>()
        planSet.pages.forEach((page) => {
          const fullImageUrl = page.image.startsWith('http')
            ? page.image
            : `${MEDIA_BASE}/${page.image}`
          void generateLowQualityThumbnail(fullImageUrl)
            .then((thumbUrl) => {
              newThumbnailUrls.set(page.id, thumbUrl)
              setThumbnailUrls(new Map(newThumbnailUrls))
            })
            .catch(() => {})
        })
      }
    }
  }, [planSet, initialPageId])

  useEffect(() => {
    if (selectedPage) {
      loadCountItems()
      loadScaleCalibration()
    }
  }, [selectedPage])

  // When switching page, use plan view if this page has no extra images; clear active extra if not valid for new page
  useEffect(() => {
    if (!selectedPage) return
    const hasAlt = !!selectedPage.image_alt
    const overlayIds = (selectedPage.overlays || []).map((o) => o.id)
    const validExtra = activeExtraImageId === 'alt' ? hasAlt : (typeof activeExtraImageId === 'number' && overlayIds.includes(activeExtraImageId))
    if (!hasAlt && overlayIds.length === 0) {
      setBackgroundView('plan')
      setActiveExtraImageId(null)
    } else if (activeExtraImageId != null && !validExtra) {
      setActiveExtraImageId(null)
    }
  }, [selectedPage?.id, selectedPage?.image_alt, selectedPage?.overlays, activeExtraImageId])

  /** Current background image URL (plan or selected extra). */
  const currentBackgroundImageUrl = selectedPage
    ? (() => {
        if (backgroundView !== 'satellite' || activeExtraImageId == null) {
          const raw = selectedPage.image
          return raw.startsWith('http') ? raw : `${MEDIA_BASE}/${raw}`
        }
        if (activeExtraImageId === 'alt' && selectedPage.image_alt) {
          const raw = selectedPage.image_alt
          return raw.startsWith('http') ? raw : `${MEDIA_BASE}/${raw}`
        }
        const overlay = (selectedPage.overlays || []).find((o) => o.id === activeExtraImageId)
        if (overlay) {
          const raw = overlay.image
          return raw.startsWith('http') ? raw : `${MEDIA_BASE}/${raw}`
        }
        const raw = selectedPage.image
        return raw.startsWith('http') ? raw : `${MEDIA_BASE}/${raw}`
      })()
    : null

  /** List of extra images for the counts sidebar (image_alt + overlays). */
  const pageExtraImages = selectedPage
    ? (() => {
        const list: { id: 'alt' | number; imageUrl: string; name: string }[] = []
        if (selectedPage.image_alt) {
          const raw = selectedPage.image_alt
          list.push({
            id: 'alt',
            imageUrl: raw.startsWith('http') ? raw : `${MEDIA_BASE}/${raw}`,
            name: selectedPage.image_alt_name?.trim() || 'Image 1',
          })
        }
        ;(selectedPage.overlays || []).forEach((o) => {
          const raw = o.image
          list.push({
            id: o.id,
            imageUrl: raw.startsWith('http') ? raw : `${MEDIA_BASE}/${raw}`,
            name: (o.name || '').trim() || '',
          })
        })
        // Fill missing names with Image N based on ordering
        return list.map((e, idx) => ({ ...e, name: e.name || `Image ${idx + 1}` }))
      })()
    : []

  /* ─── Undo / Redo ─── */

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Use ref for instant check — avoids stale closure race with ViewerCanvas
      if (isDrawingRef.current) return
      if (e.defaultPrevented) return

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (historyIndex > 0) {
          const prevIndex = historyIndex - 1
          setCountItems([...history[prevIndex]])
          setHistoryIndex(prevIndex)
        }
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'y' || (e.key === 'z' && e.shiftKey))
      ) {
        e.preventDefault()
        if (historyIndex < history.length - 1) {
          const nextIndex = historyIndex + 1
          setCountItems([...history[nextIndex]])
          setHistoryIndex(nextIndex)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [historyIndex, history.length])

  /* ─── Close menu on outside click ─── */

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  /* ─── Loaders ─── */

  async function loadPlanSet() {
    try {
      const data = await fetchPlanSet(planSetId)
      setPlanSet(data)
      return data
    } catch (err) {
      console.error('Failed to load plan set:', err)
      return null
    }
  }

  async function handleUploadAlt(file: File) {
    if (!selectedPage) return
    const pageId = selectedPage.id
    const hadAlt = !!selectedPage.image_alt
    setUploadAltLoading(true)
    try {
      const updated = await uploadPlanPageAlt(pageId, file)
      const data = await loadPlanSet()
      const nextPage = data?.pages?.find((p) => p.id === pageId) ?? updated
      setSelectedPage(nextPage)
      setBackgroundView('satellite')
      if (!hadAlt && nextPage.image_alt) {
        setActiveExtraImageId('alt')
      } else if (nextPage.overlays?.length) {
        setActiveExtraImageId(nextPage.overlays[nextPage.overlays.length - 1].id)
      }
    } catch (err) {
      console.error('Upload alternate image failed:', err)
      alert(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadAltLoading(false)
      if (uploadAltInputRef.current) uploadAltInputRef.current.value = ''
    }
  }

  async function loadCountDefinitions() {
    try {
      const data = await fetchCountDefinitions(planSetId)
      setCountDefinitions(data)
    } catch (err) {
      console.error('Failed to load count definitions:', err)
    }
  }

  async function loadCountItems() {
    if (!selectedPage) return

    // CRITICAL: Always check cache first - cache has the latest geometry updates
    // Only fetch from server if cache doesn't exist (first time loading this page)
    const cached = pageHistoryRef.current.get(selectedPage.id)
    if (cached && cached.history.length > 0 && cached.historyIndex >= 0) {
      // Use cached history - it has the latest geometry updates
      // Deep copy items from cache to ensure geometry arrays are independent
      const cachedItems = cached.history[cached.historyIndex].map(i => ({
        ...i,
        geometry: i.geometry.map(coord => [...coord])
      }))
      setCountItems(cachedItems)
      // Deep copy history as well
      const deepCopiedHistory = cached.history.map(h => h.map(i => ({
        ...i,
        geometry: i.geometry.map(coord => [...coord])
      })))
      setHistory(deepCopiedHistory)
      setHistoryIndex(cached.historyIndex)
      // Update ref to match
      countItemsRef.current = cachedItems.map(i => ({
        ...i,
        geometry: i.geometry.map(coord => [...coord])
      }))
      return
    }

    // Only fetch from server if no cache exists (first time loading this page)
    try {
      const data = await fetchCountItems(undefined, selectedPage.id)
      setCountItems(data)
      setHistory([[...data]])
      setHistoryIndex(0)
      // Initialize cache with server data
      pageHistoryRef.current.set(selectedPage.id, {
        history: [[...data]],
        historyIndex: 0
      })
    } catch (err) {
      console.error('Failed to load count items:', err)
    }
  }

  async function loadScaleCalibration() {
    if (!selectedPage) return
    try {
      const cal = await fetchScaleCalibration(selectedPage.id)
      if (cal) {
        const newScale = { realWorldFeet: cal.real_world_feet, pixelDistance: cal.pixel_distance }
        setScale(newScale)
        setIsCalibrated(true)
        lastCalibrationScaleRef.current = newScale
      } else {
        setScale({ realWorldFeet: 1, pixelDistance: 100 })
        setIsCalibrated(false)
        lastCalibrationScaleRef.current = null
      }
    } catch (err) {
      console.error('Failed to load scale calibration:', err)
    }
  }

  /* ─── Scale calibration ─── */

  function handleStartCalibration() {
    setIsCalibrating(true)
    setCalibrationPixelDist(null)
    setActiveCountId(null)
  }

  function handleCancelCalibration() {
    setIsCalibrating(false)
    setCalibrationPixelDist(null)
  }

  function handleCalibrationComplete(pixelDist: number) {
    setCalibrationPixelDist(pixelDist)
    setIsCalibrating(false)
  }

  function handleCalibrationSaved() {
    setIsCalibrated(true)
    setCalibrationPixelDist(null)
    setIsCalibrating(false)
  }

  // Recalculate all items when calibration is saved and scale changes
  useEffect(() => {
    async function recalculateAllItems() {
      if (!isCalibrated || !selectedPage || imageSize.width === 0 || imageSize.height === 0 || countItems.length === 0) {
        return
      }
      
      const currentScale = { realWorldFeet: scale.realWorldFeet, pixelDistance: scale.pixelDistance }
      const lastScale = lastCalibrationScaleRef.current
      
      // Only recalculate if scale actually changed (new calibration)
      if (lastScale && 
          lastScale.realWorldFeet === currentScale.realWorldFeet && 
          lastScale.pixelDistance === currentScale.pixelDistance) {
        return // Scale hasn't changed, skip recalculation
      }
      
      lastCalibrationScaleRef.current = currentScale
      
      const fpp = currentScale.realWorldFeet / currentScale.pixelDistance
      const width = imageSize.width
      const height = imageSize.height

      function denorm(nx: number, ny: number): [number, number] {
        return [nx * width, ny * height]
      }

      function dist(x1: number, y1: number, x2: number, y2: number) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
      }

      function calcLength(vertices: number[][]): number {
        let total = 0
        for (let i = 1; i < vertices.length; i++) {
          const [x1, y1] = denorm(vertices[i - 1][0], vertices[i - 1][1])
          const [x2, y2] = denorm(vertices[i][0], vertices[i][1])
          total += dist(x1, y1, x2, y2) * fpp
        }
        return total
      }

      function calcArea(vertices: number[][]): number {
        const verts = (vertices.length > 1 &&
          vertices[vertices.length - 1][0] === vertices[0][0] &&
          vertices[vertices.length - 1][1] === vertices[0][1])
          ? vertices.slice(0, -1)
          : vertices
        if (verts.length < 3) return 0
        let a = 0
        for (let i = 0; i < verts.length; i++) {
          const j = (i + 1) % verts.length
          const [x1, y1] = denorm(verts[i][0], verts[i][1])
          const [x2, y2] = denorm(verts[j][0], verts[j][1])
          a += x1 * y2 - x2 * y1
        }
        return Math.abs(a) / 2 * fpp * fpp
      }

      function calcPerimeter(vertices: number[][]): number {
        const verts = (vertices.length > 1 &&
          vertices[vertices.length - 1][0] === vertices[0][0] &&
          vertices[vertices.length - 1][1] === vertices[0][1])
          ? vertices
          : [...vertices, vertices[0]]
        return calcLength(verts)
      }

      // Recalculate and update all items for the current page
      const pageItems = countItemsRef.current.filter(item => item.page === selectedPage.id)
      const updates = pageItems.map(item => {
        const updates: Partial<CountItem> = {}
        if (item.geometry_type === 'polyline') {
          updates.length_ft = calcLength(item.geometry)
        } else if (item.geometry_type === 'polygon') {
          updates.area_sqft = calcArea(item.geometry)
          updates.perimeter_ft = calcPerimeter(item.geometry)
        }
        // For 'point', 'rect', 'circle', 'triangle' - no measurements to recalculate
        return { item, updates }
      }).filter(({ updates }) => Object.keys(updates).length > 0)

      // Update all items in parallel
      if (updates.length > 0) {
        try {
          const updated = await Promise.all(
            updates.map(({ item, updates }) => updateCountItem(item.id, updates))
          )
          // Update local state
          updated.forEach(updatedItem => {
            handleCountItemUpdatedRef.current?.(updatedItem)
          })
        } catch (err) {
          console.error('Failed to recalculate items after calibration:', err)
        }
      }
    }
    
    void recalculateAllItems()
  }, [isCalibrated, scale.realWorldFeet, scale.pixelDistance, selectedPage?.id, imageSize.width, imageSize.height])

  /* ─── Page navigation ─── */

  function handlePageSelect(page: PlanPage) {
    if (selectedPage && selectedPage.id === page.id) return
    // Save current page's undo history before switching
    if (selectedPage) {
      pageHistoryRef.current.set(selectedPage.id, { history, historyIndex })
    }
    scrollFractionRef.current = null
    setSelectedPage(page)
    setBaselineReady(false)
    setImageSize({ width: 0, height: 0 })
    setZoom(1)
  }

  function captureScrollFraction() {
    const c = imageRegionRef.current
    if (!c) return
    scrollFractionRef.current = {
      x: c.scrollWidth > c.clientWidth
        ? (c.scrollLeft + c.clientWidth / 2) / c.scrollWidth
        : 0.5,
      y: c.scrollHeight > c.clientHeight
        ? (c.scrollTop + c.clientHeight / 2) / c.scrollHeight
        : 0.5,
    }
  }

  function handleZoomIn() {
    captureScrollFraction()
    setZoom((prev) => nextZoomLevel(prev, 'in'))
  }

  function handleZoomOut() {
    captureScrollFraction()
    setZoom((prev) => nextZoomLevel(prev, 'out'))
  }

  // Global guard: prevent Chrome/Edge page zoom on /designer (this page).
  // If pinch happens over the viewer area, we zoom the board; otherwise we
  // just block browser zoom entirely so nav bar / sidebar never scale.
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey) return

      // Always block the browser's own zoom when this page is active.
      e.preventDefault()

      const container = viewerRef.current
      if (!container) return

      // Only change our zoom when the gesture originates inside the viewer.
      if (container.contains(e.target as Node)) {
        captureScrollFraction()
        const direction: 'in' | 'out' = e.deltaY < 0 ? 'in' : 'out'
        setZoom((prev) => nextZoomLevel(prev, direction))
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

  /* ─── Count definition CRUD ─── */

  function handleCountDefinitionCreated(def: CountDefinition) {
    setCountDefinitions([...countDefinitions, def])
    setActiveCountId(def.id)
  }

  function handleCountDefinitionUpdated(def: CountDefinition) {
    setCountDefinitions(countDefinitions.map((d) => (d.id === def.id ? def : d)))
  }

  function handleCountDefinitionDeleted(id: number) {
    setCountDefinitions(countDefinitions.filter((d) => d.id !== id))
    const newItems = countItems.filter((item) => item.count_definition !== id)
    setCountItems(newItems)
    pushHistory(newItems)
    if (activeCountId === id) setActiveCountId(null)
  }

  // When user selects a count, save its trade as preset for next "Create count" (dataset/trade preset for all counts).
  useEffect(() => {
    if (activeCountId == null) return
    const def = countDefinitions.find((d) => d.id === activeCountId)
    if (def?.trade) {
      try {
        window.localStorage.setItem('plan-viewer-count-preset', JSON.stringify({ trade: def.trade }))
      } catch {}
    }
  }, [activeCountId, countDefinitions])

  /* ─── Count item CRUD ─── */

  function pushHistory(items: CountItem[]) {
    // Use ref to get current index to avoid stale closures
    const currentIndex = historyIndexRef.current
    setHistory((prevHistory) => {
      const newHistory = prevHistory.slice(0, currentIndex + 1)
      newHistory.push([...items])
      const newIndex = newHistory.length - 1
      historyIndexRef.current = newIndex
      setHistoryIndex(newIndex)
      return newHistory
    })
  }

  function handleCountItemCreated(item: CountItem) {
    const newItems = [...countItems, item]
    setCountItems(newItems)
    pushHistory(newItems)
  }

  /** Called when a shape is re-created by vertex redo auto-finish. Advance history without pushing so remaining redos stay available. */
  function handleCountItemRestoredByRedo(item: CountItem) {
    const nextIndex = historyIndex + 1
    if (nextIndex >= history.length) {
      handleCountItemCreated(item)
      return
    }
    const nextSnapshot = history[nextIndex]
    const currentIds = new Set(countItems.map((i) => i.id))
    const added = nextSnapshot.filter((i) => !currentIds.has(i.id))
    if (added.length !== 1) {
      handleCountItemCreated(item)
      return
    }
    const idMap = new Map([[added[0].id, item]])
    const newHistory = history.map((snapshot, idx) =>
      idx <= historyIndex ? snapshot : snapshot.map((si) => idMap.get(si.id) ?? si)
    )
    setHistory(newHistory)
    setCountItems([...newHistory[nextIndex]])
    setHistoryIndex(nextIndex)
    resetDrawingRef.current?.()
  }

  function handleCountItemDeleted(id: number) {
    const newItems = countItems.filter((item) => item.id !== id)
    setCountItems(newItems)
    pushHistory(newItems)
  }

  function handleCountItemsBatchDeleted(ids: number[]) {
    const idSet = new Set(ids)
    const currentItems = countItemsRef.current.length > 0 ? countItemsRef.current : countItems
    const newItems = currentItems.filter((item) => !idSet.has(item.id))
    setCountItems(newItems)
    countItemsRef.current = newItems
    pushHistory(newItems)
  }

  function handleCountItemsBatchCreated(items: CountItem[]) {
    const currentItems = countItemsRef.current.length > 0 ? countItemsRef.current : countItems
    const newItems = [...currentItems, ...items]
    setCountItems(newItems)
    countItemsRef.current = newItems
    pushHistory(newItems)
  }

  function handleCountItemsBatchMoved(updates: { id: number; item: CountItem }[]) {
    if (updates.length === 0) return
    const updateMap = new Map(updates.map(({ id, item }) => [id, item]))
    const currentItems = countItemsRef.current.length > 0 ? countItemsRef.current : countItems
    const newItems = currentItems.map((i) => {
      const updated = updateMap.get(i.id)
      return updated ? { ...i, ...updated, geometry: updated.geometry.map((c: number[]) => [...c]) } : i
    })
    countItemsRef.current = newItems.map((i) => ({ ...i, geometry: i.geometry.map((c) => [...c]) }))
    flushSync(() => {
      setCountItems(newItems)
      pushHistory(newItems)
    })
  }

  // Keep refs in sync
  useEffect(() => {
    countItemsRef.current = countItems
  }, [countItems])

  // Keep historyIndex ref in sync
  useEffect(() => {
    historyIndexRef.current = historyIndex
  }, [historyIndex])

  useEffect(() => {
    handleCountItemUpdatedRef.current = handleCountItemUpdated
  })

  function handleCountItemUpdated(item: CountItem) {
    // CRITICAL: Update cache DIRECTLY and SYNCHRONOUSLY (outside React state updates)
    // This ensures cache is updated immediately, even before React batches state updates
    if (!selectedPage) {
      // If no page selected, just update state normally
      setCountItems((prevItems) => {
        const currentItem = prevItems.find((i) => i.id === item.id)
        const mergedItem: CountItem = currentItem
          ? { ...currentItem, ...item, geometry: item.geometry.map(coord => [...coord]) }
          : { ...item, geometry: item.geometry.map(coord => [...coord]) }
        return prevItems.map((i) => (i.id === item.id ? mergedItem : i))
      })
      return
    }

    // Get current state synchronously (before React batches updates)
    const currentItems = countItemsRef.current.length > 0 ? countItemsRef.current : countItems
    const currentItem = currentItems.find((i) => i.id === item.id)
    
    // Create merged item with NEW geometry
    const mergedItem: CountItem = currentItem
      ? {
          ...currentItem,
          ...item,
          geometry: item.geometry.map(coord => [...coord]) // CRITICAL: Use NEW geometry
        }
      : {
          ...item,
          geometry: item.geometry.map(coord => [...coord])
        }
    
    const newItems = currentItems.map((i) => (i.id === item.id ? mergedItem : i))
    
    // CRITICAL: Update cache DIRECTLY and SYNCHRONOUSLY (not through React state)
    const currentIndex = historyIndexRef.current
    const currentHistory = history.length > 0 ? history : []
    const newHistory = currentHistory.slice(0, currentIndex + 1)
    
    // Deep copy items for history
    const historyItems = newItems.map(i => ({
      ...i,
      geometry: i.geometry.map(coord => [...coord])
    }))
    newHistory.push(historyItems)
    const newIndex = newHistory.length - 1
    
    // Update cache IMMEDIATELY (synchronous, not batched by React)
    const cachedHistory = newHistory.map(h => h.map(i => ({ 
      ...i, 
      geometry: i.geometry.map(coord => [...coord])
    })))
    pageHistoryRef.current.set(selectedPage.id, { 
      history: cachedHistory, 
      historyIndex: newIndex 
    })
    
    // Update refs IMMEDIATELY (synchronous)
    historyIndexRef.current = newIndex
    countItemsRef.current = newItems.map(i => ({
      ...i,
      geometry: i.geometry.map(coord => [...coord])
    }))
    
    // Flush state so canvas has new geometry before drag handler continues (avoids drop glitch)
    flushSync(() => {
      setCountItems(newItems)
      setHistory(newHistory)
      setHistoryIndex(newIndex)
    })
    
    // Log for debugging
    console.log('Position updated:', {
      itemId: item.id,
      newGeometry: item.geometry,
      cacheUpdated: true,
      cacheHistoryIndex: newIndex
    })
  }

  /* ─── Export as PDF ─── */

  useEffect(() => {
    if (!exportPdfModalOpen || !planSet?.id) return
    setExportPdfSelectedPageIds(new Set((planSet.pages || []).map((p) => p.id)))
    fetchCountItems(undefined, undefined, planSet.id)
      .then((items) => setExportPdfAllCountItems(items))
      .catch(() => setExportPdfAllCountItems([]))
  }, [exportPdfModalOpen, planSet?.id])

  function pageHasCountsOrNotes(pageId: number): boolean {
    const hasCounts = exportPdfAllCountItems.some((i) => i.page === pageId)
    const pageNotes = notes.get(pageId) || []
    return hasCounts || pageNotes.length > 0
  }

  async function handleExportPdf(selectedIds?: number[]) {
    if (!planSet || !planSet.pages?.length) {
      alert('No plan set or pages to export.')
      return
    }
    const pageIdsToExport = selectedIds && selectedIds.length > 0 ? selectedIds : planSet.pages.map((p) => p.id)
    const total = pageIdsToExport.length
    setExportPdfLoading(true)
    setExportPdfProgress({ current: 0, total })
    try {
      await exportPlanAsPdf({
        planSet,
        pages: planSet.pages,
        pageIds: pageIdsToExport,
        countDefinitions,
        getCountItemsForPage: (pageId: number) => fetchCountItems(undefined, pageId),
        onProgress: (current, total) => setExportPdfProgress({ current, total }),
      })
      setExportPdfModalOpen(false)
    } catch (err) {
      console.error('Export PDF failed:', err)
      alert('Failed to export PDF: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setExportPdfLoading(false)
      setExportPdfProgress(null)
    }
  }

  /* ─── Note creation ─── */

  function handleNoteCreated(nx: number, ny: number) {
    if (!selectedPage) return
    setPendingNotePos({ x: nx, y: ny })
    setEditingNoteDraft('')
    setEditingNoteId(null)
  }

  function handleNoteTextChange(noteId: string, text: string) {
    if (!selectedPage) return
    setNotes(prev => {
      const next = new Map(prev)
      const existing = next.get(selectedPage.id) || []
      next.set(selectedPage.id, existing.map(n => n.id === noteId ? { ...n, text } : n))
      return next
    })
  }

  function handleNoteEditDone(noteId: string) {
    if (!selectedPage) return
    setEditingNoteId(null)
    const pageNotes = notes.get(selectedPage.id) || []
    const note = pageNotes.find(n => n.id === noteId)
    if (note && !note.text.trim()) {
      setNotes(prev => {
        const next = new Map(prev)
        next.set(selectedPage.id, (next.get(selectedPage.id) || []).filter(n => n.id !== noteId))
        return next
      })
    }
  }

  function handleNoteDelete(noteId: string) {
    if (!selectedPage) return
    setNotes(prev => {
      const next = new Map(prev)
      next.set(selectedPage.id, (next.get(selectedPage.id) || []).filter(n => n.id !== noteId))
      return next
    })
    if (editingNoteId === noteId) setEditingNoteId(null)
  }

  function handleNoteMoved(noteId: string, nx: number, ny: number) {
    if (!selectedPage) return
    setNotes(prev => {
      const next = new Map(prev)
      const existing = next.get(selectedPage.id) || []
      next.set(
        selectedPage.id,
        existing.map(n => (n.id === noteId ? { ...n, x: nx, y: ny } : n)),
      )
      return next
    })
  }

  const currentPageNotes = selectedPage ? (notes.get(selectedPage.id) || []) : []

  function handleNoteEdit(noteId: string) {
    if (!selectedPage) return
    const pageNotes = notes.get(selectedPage.id) || []
    const note = pageNotes.find(n => n.id === noteId)
    setEditingNoteId(noteId)
    setEditingNoteDraft(note?.text ?? '')
  }

  function handleNoteSubmit() {
    if (!selectedPage) return
    const text = editingNoteDraft.trim()

    // Creating a brand-new note (text-first flow)
    if (pendingNotePos) {
      if (text) {
        const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const note = { id, x: pendingNotePos.x, y: pendingNotePos.y, text, color: noteColor }
        setNotes(prev => {
          const next = new Map(prev)
          const existing = next.get(selectedPage.id) || []
          next.set(selectedPage.id, [...existing, note])
          return next
        })
      }
      setPendingNotePos(null)
      setEditingNoteDraft('')
      return
    }

    // Editing an existing note
    if (editingNoteId) {
      if (text) {
        handleNoteTextChange(editingNoteId, text)
      } else {
        handleNoteDelete(editingNoteId)
      }
      setEditingNoteId(null)
      setEditingNoteDraft('')
    }
  }

  function handleNoteDismiss() {
    setPendingNotePos(null)
    setEditingNoteId(null)
    setEditingNoteDraft('')
    setNoteEditorDragging(false)
    setNoteEditorDragPosition(null)
    noteEditorDragRef.current = null
  }

  // Dragging the note editor overlay: update ref every move, throttle setState to requestAnimationFrame for instant feel
  useEffect(() => {
    if (!noteEditorDragging || !imageSize.width || !imageSize.height) return
    const ez = fitZoom * zoom
    let rafId = 0
    let rafScheduled = false
    const onMove = (e: MouseEvent) => {
      const r = noteEditorDragRef.current
      if (!r) return
      const dx = (e.clientX - r.startClientX) / ez / imageSize.width
      const dy = (e.clientY - r.startClientY) / ez / imageSize.height
      r.currentNX = Math.max(0, Math.min(1, r.startNX + dx))
      r.currentNY = Math.max(0, Math.min(1, r.startNY + dy))
      if (!rafScheduled) {
        rafScheduled = true
        rafId = requestAnimationFrame(() => {
          rafScheduled = false
          const ref = noteEditorDragRef.current
          if (ref) setNoteEditorDragPosition({ x: ref.currentNX, y: ref.currentNY })
        })
      }
    }
    const onUp = () => {
      const r = noteEditorDragRef.current
      setNoteEditorDragging(false)
      setNoteEditorDragPosition(null)
      if (r) {
        if (r.isNew) setPendingNotePos({ x: r.currentNX, y: r.currentNY })
        else if (r.noteId) handleNoteMoved(r.noteId, r.currentNX, r.currentNY)
      }
      noteEditorDragRef.current = null
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mouseup', onUp)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [noteEditorDragging, fitZoom, zoom, imageSize.width, imageSize.height])

  // Dragging a placed note card (HTML overlay): ref + RAF for smoothness; commit on mouseup
  useEffect(() => {
    if (!noteDraggingId || !imageSize.width || !imageSize.height) return
    const ez = fitZoom * zoom
    let rafId = 0
    let rafScheduled = false
    const onMove = (e: MouseEvent) => {
      const r = noteCardDragRef.current
      if (!r) return
      const dx = (e.clientX - r.startClientX) / ez / imageSize.width
      const dy = (e.clientY - r.startClientY) / ez / imageSize.height
      const nx = Math.max(0, Math.min(1, r.startNX + dx))
      const ny = Math.max(0, Math.min(1, r.startNY + dy))
      r.currentNX = nx
      r.currentNY = ny
      if (!rafScheduled) {
        rafScheduled = true
        rafId = requestAnimationFrame(() => {
          rafScheduled = false
          const ref = noteCardDragRef.current
          if (ref) setNoteDragPosition({ x: ref.currentNX, y: ref.currentNY })
        })
      }
    }
    const onUp = () => {
      const r = noteCardDragRef.current
      setNoteDraggingId(null)
      setNoteDragPosition(null)
      if (r) handleNoteMoved(r.noteId, r.currentNX, r.currentNY)
      noteCardDragRef.current = null
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mouseup', onUp)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [noteDraggingId, fitZoom, zoom, imageSize.width, imageSize.height])

  /* ─── Undo / Redo buttons ─── */

  function handleUndo() {
    // During active drawing, undo removes the last vertex
    if (isDrawingRef.current && vertexUndoRef.current) {
      vertexUndoRef.current()
      return
    }
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1
      const currentItems = history[historyIndex]
      const prevItems = history[prevIndex]

      // Detect if the last action added a single polyline/polygon — reopen it
      const prevIds = new Set(prevItems.map((i) => i.id))
      const added = currentItems.filter((i) => !prevIds.has(i.id))

      if (added.length === 1 && (added[0].geometry_type === 'polyline' || added[0].geometry_type === 'polygon')) {
        const item = added[0]
        markSaving()
        deleteCountItem(item.id).then(() => markSaved()).catch(() => markSaveError())
        setCountItems([...prevItems])
        setHistoryIndex(prevIndex)
        setActiveCountId(item.count_definition)
        const verts = item.geometry_type === 'polygon'
          ? item.geometry.slice(0, -1)
          : [...item.geometry]
        const reopenVerts = verts.length > 1 ? verts.slice(0, -1) : []
        const removedVerts = verts.slice(reopenVerts.length)
        setReopenDrawing({
          type: item.geometry_type === 'polygon' ? 'drawing_polygon' : 'drawing_polyline',
          vertices: reopenVerts,
          redoStack: removedVerts.reverse(),
        })
        return
      }

      setCountItems([...prevItems])
      setHistoryIndex(prevIndex)
    }
  }

  function handleRedo() {
    // During active drawing, redo restores the last undone vertex
    if (isDrawingRef.current && vertexRedoRef.current) {
      vertexRedoRef.current()
      return
    }
    // Even if not drawing, if vertex redo stack has items (shape was fully undone to idle),
    // use vertex redo to re-enter drawing mode one vertex at a time
    if (hasVertexRedoRef.current() && vertexRedoRef.current) {
      vertexRedoRef.current()
      return
    }
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1
      const currentItems = history[historyIndex]
      const nextItems = history[nextIndex]

      // Detect items that exist in nextItems but not in currentItems (were added)
      const currentIds = new Set(currentItems.map((i) => i.id))
      const added = nextItems.filter((i) => !currentIds.has(i.id))

      // Check if any added items were deleted from the backend (by a previous undo)
      // and need to be re-created for persistence
      if (added.length > 0) {
        markSaving()
        Promise.all(
          added.map((item) =>
            createCountItem({
              count_definition: item.count_definition,
              page: item.page,
              geometry_type: item.geometry_type,
              geometry: item.geometry,
              area_sqft: item.area_sqft ?? undefined,
              perimeter_ft: item.perimeter_ft ?? undefined,
              length_ft: item.length_ft ?? undefined,
              rotation_deg: item.rotation_deg ?? 0,
            }).then((newItem) => ({ oldId: item.id, newItem }))
          )
        ).then((results) => {
          markSaved()
          const idMap = new Map(results.map((r) => [r.oldId, r.newItem]))
          const newHistory = history.map((snapshot, idx) => {
            if (idx <= historyIndex) return snapshot
            return snapshot.map((si) => idMap.get(si.id) ?? si)
          })
          setHistory(newHistory)
          setCountItems([...newHistory[nextIndex]])
          setHistoryIndex(nextIndex)
          resetDrawingRef.current?.()
        }).catch(() => {
          markSaveError()
          setCountItems([...nextItems])
          setHistoryIndex(nextIndex)
        })
        return
      }

      setCountItems([...nextItems])
      setHistoryIndex(nextIndex)
      resetDrawingRef.current?.()
    }
  }

  /* ─── Zoom / fit ─── */

  const computeFitZoom = useCallback(
    (imgWidth: number, imgHeight: number): number | null => {
      const container = imageRegionRef.current
      if (!container) return null

      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight
      if (containerWidth === 0 || containerHeight === 0) return null

      const rad = rotation * Math.PI / 180
      const absC = Math.abs(Math.cos(rad))
      const absS = Math.abs(Math.sin(rad))
      const visualBaseW = imgWidth * absC + imgHeight * absS
      const visualBaseH = imgWidth * absS + imgHeight * absC

      const scaleX = containerWidth / visualBaseW
      const scaleY = containerHeight / visualBaseH
      return Math.min(scaleX, scaleY, 1)
    },
    [rotation]
  )

  function handleFitToScreen() {
    if (!imageRegionRef.current || !imageSize.width || !imageSize.height) return
    scrollFractionRef.current = null
    const nextFitZoom = computeFitZoom(imageSize.width, imageSize.height)
    if (nextFitZoom == null) return
    setFitZoom(nextFitZoom)
    setZoom(1)
    setBaselineReady(true)
  }

  function handleRotate() {
    scrollFractionRef.current = null
    setRotation((r) => (r + 90) % 360)
  }

  const adjustScroll = useCallback(() => {
    const c = imageRegionRef.current
    if (!c) return
    const frac = scrollFractionRef.current
    scrollFractionRef.current = null
    if (frac) {
      c.scrollLeft = Math.max(0, frac.x * c.scrollWidth - c.clientWidth / 2)
      c.scrollTop = Math.max(0, frac.y * c.scrollHeight - c.clientHeight / 2)
    } else {
      c.scrollLeft = (c.scrollWidth - c.clientWidth) / 2
      c.scrollTop = (c.scrollHeight - c.clientHeight) / 2
    }
  }, [])

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
    setBaselineReady(false)
  }

  useLayoutEffect(() => {
    if (!imageSize.width || !imageSize.height) return
    if (!imageRegionRef.current) return

    const container = imageRegionRef.current

    const applyBaseline = () => {
      const nextFit = computeFitZoom(imageSize.width, imageSize.height)
      if (nextFit == null) return
      setFitZoom((prev) => (Math.abs(prev - nextFit) < 1e-6 ? prev : nextFit))

      if (!baselineReady) {
        setZoom(1)
        setBaselineReady(true)
      }

      adjustScroll()
    }

    applyBaseline()

    const ro = new ResizeObserver(() => {
      applyBaseline()
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [baselineReady, computeFitZoom, imageSize.width, imageSize.height, adjustScroll])

  useLayoutEffect(() => {
    if (imageSize.width > 0 && imageSize.height > 0) {
      adjustScroll()
    }
  }, [fitZoom, zoom, rotation, adjustScroll])

  // Persist undo history to pageHistoryRef whenever it changes
  useEffect(() => {
    if (selectedPage && history.length > 0) {
      pageHistoryRef.current.set(selectedPage.id, { history, historyIndex })
    }
  }, [selectedPage, history, historyIndex])

  /* ─── Pan mode: drag-to-scroll ─── */

  useEffect(() => {
    const el = imageRegionRef.current
    if (!el) return

    let dragging = false
    let startX = 0, startY = 0
    let scrollX0 = 0, scrollY0 = 0

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return
      if (!panMode && !e.ctrlKey) return
      dragging = true
      startX = e.clientX
      startY = e.clientY
      scrollX0 = el!.scrollLeft
      scrollY0 = el!.scrollTop
      el!.style.cursor = 'grabbing'
      e.preventDefault()
    }
    function onMouseMove(e: MouseEvent) {
      if (!dragging) return
      el!.scrollLeft = scrollX0 - (e.clientX - startX)
      el!.scrollTop = scrollY0 - (e.clientY - startY)
    }
    function onMouseUp() {
      if (!dragging) return
      dragging = false
      el!.style.cursor = ''
    }

    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [panMode])

  /* ─── Render ─── */

  if (Number.isNaN(planSetId)) {
    return (
      <div className="plan-viewer-page">
        <div className="loading">Invalid plan set.</div>
        <button
          type="button"
          className="gallery-back-btn"
          onClick={() => navigate('/designer')}
        >
          &larr; Back to projects
        </button>
      </div>
    )
  }

  if (!planSet) {
    return (
      <div className="plan-viewer-page">
        <div className="loading">Loading plan set...</div>
      </div>
    )
  }

  // Always use the latest countItems - filter for current page
  const pageCountItems = countItems.filter(
    (item) => item.page === selectedPage?.id
  )
  const pages = planSet.pages || []
  const currentIndex =
    selectedPage && pages.length > 0
      ? pages.findIndex((p) => p.id === selectedPage.id)
      : -1
  const currentNumber = currentIndex >= 0 ? currentIndex + 1 : 0
  const totalPages = pages.length

  function goToPage(offset: number) {
    if (currentIndex < 0) return
    const nextIndex = currentIndex + offset
    if (nextIndex < 0 || nextIndex >= totalPages) return
    handlePageSelect(pages[nextIndex])
  }

  return (
    <div className="plan-viewer-page">
      <header className="viewer-header">
        <div className="viewer-header-left">
          <div className="viewer-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="viewer-menu-btn"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              <Menu className="viewer-menu-icon" />
            </button>
            {menuOpen && (
              <div className="viewer-menu-dropdown">
                <button
                  type="button"
                  className="viewer-menu-item"
                  onClick={() => {
                    setMenuOpen(false)
                    navigate(`/designer/plan-set/${planSetId}`)
                  }}
                >
                  Back to project
                </button>
                <button
                  type="button"
                  className="viewer-menu-item"
                  onClick={() => {
                    setMenuOpen(false)
                    navigate('/designer')
                  }}
                >
                  Back to all projects
                </button>
              </div>
            )}
          </div>
          <div className="viewer-title-group">
            <h2>{planSet.name}</h2>
          </div>
        </div>

        {selectedPage && totalPages > 0 && (
          <div className="viewer-header-center">
            <div className="viewer-nav-controls">
              <button
                className="viewer-page-nav-btn"
                onClick={() => goToPage(-1)}
                disabled={currentIndex <= 0}
                aria-label="Previous page"
              >
                <ChevronLeft className="viewer-page-nav-icon" />
              </button>
              <div className="viewer-page-indicator">
                <span className="viewer-page-index">
                  {currentNumber} of {totalPages}
                </span>
                <span className="viewer-page-label">
                  {selectedPage.title || `Sheet ${selectedPage.page_number}`}
                </span>
              </div>
              <button
                className="viewer-page-nav-btn"
                onClick={() => goToPage(1)}
                disabled={currentIndex >= totalPages - 1}
                aria-label="Next page"
              >
                <ChevronRight className="viewer-page-nav-icon" />
              </button>
            </div>

            <div className="viewer-zoom-controls">
              <span className="viewer-zoom-label">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="viewer-view-btn"
                onClick={() => {
                  handleFitToScreen()
                }}
                aria-label="Reset zoom to fit"
              >
                Fit
              </button>
            </div>
            <div
              className={`viewer-save-status viewer-save-${saveStatus}`}
              title={
                saveStatus === 'saving' ? 'Saving…' :
                saveStatus === 'saved' ? 'Saved' :
                saveStatus === 'error' ? 'Save failed' :
                'Auto-save'
              }
            >
              {saveStatus === 'saving' && <Loader2 size={16} className="viewer-save-spin" />}
              {saveStatus === 'saved' && <Check size={16} />}
              {saveStatus === 'error' && <AlertCircle size={16} />}
              {saveStatus === 'idle' && <Check size={16} />}
            </div>
          </div>
        )}

        <div className="viewer-header-right">
          <button
            type="button"
            className="viewer-export-pdf-btn"
            onClick={() => setExcelModalOpen(true)}
            title="Export counts to Excel"
            aria-label="Export to Excel"
          >
            <FileSpreadsheet size={20} />
            <span className="viewer-export-pdf-label">Export Excel</span>
          </button>
          <button
            type="button"
            className="viewer-export-pdf-btn"
            onClick={() => planSet?.pages?.length ? setExportPdfModalOpen(true) : undefined}
            disabled={exportPdfLoading || !planSet?.pages?.length}
            title="Export as PDF – choose which pages to include"
            aria-label="Export as PDF"
          >
            <FileDown size={20} />
            <span className="viewer-export-pdf-label">
              {exportPdfLoading && exportPdfProgress
                ? `Exporting ${exportPdfProgress.current}/${exportPdfProgress.total}…`
                : 'Export PDF'}
            </span>
          </button>
        </div>
      </header>

      <main className={`viewer-main ${pagesSidebarVisible ? 'sidebar-visible' : ''}`}>
        <div className={`viewer-container ${pagesSidebarVisible ? 'sidebar-visible' : ''}`} ref={viewerRef}>
          <div
            className={`viewer-pages-sidebar-wrap ${pagesSidebarVisible ? 'visible' : ''}`}
            aria-hidden={!pagesSidebarVisible}
          >
            <PagesSidebar
              pages={pages}
              selectedPage={selectedPage}
              onSelectPage={handlePageSelect}
              thumbnailUrls={thumbnailUrls}
              viewMode={pagesViewMode}
              onViewModeChange={setPagesViewMode}
            />
          </div>
          <div className="viewer-toolbar-rail">
            <div className="viewer-sheets-toggle-rail">
              <button
                type="button"
                className="viewer-sheets-toggle-btn"
                onClick={() => setPagesSidebarVisible((v) => !v)}
                aria-label={pagesSidebarVisible ? 'Hide sheets' : 'Show sheets'}
                title={pagesSidebarVisible ? 'Hide sheets panel' : 'Show sheets panel'}
              >
                {pagesSidebarVisible ? (
                  <PanelLeftClose size={20} />
                ) : (
                  <PanelLeft size={20} />
                )}
              </button>
            </div>
            <input
              type="file"
              ref={uploadAltInputRef}
              accept="image/*,.pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUploadAlt(f)
              }}
            />
            <Toolbar
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onResetView={handleFitToScreen}
              onRotate={handleRotate}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={isDrawing || historyIndex > 0}
              canRedo={isDrawing || historyIndex < history.length - 1}
              panMode={panMode}
              countsVisible={countsVisible}
              onSetPanMode={setPanMode}
              onToggleCountsVisible={() => setCountsVisible((v) => !v)}
              noteMode={noteMode}
              noteColor={noteColor}
              onSetNoteMode={setNoteMode}
              onNoteColorChange={setNoteColor}
              eraseMode={eraseMode}
              onSetEraseMode={setEraseMode}
              hasPage={!!selectedPage}
              hasAltImage={pageExtraImages.length > 0}
              backgroundView={backgroundView}
              onBackgroundViewChange={(view) => {
                setBackgroundView(view)
                if (view === 'plan') setActiveExtraImageId(null)
              }}
              onUploadAltClick={() => uploadAltInputRef.current?.click()}
              uploadAltLoading={uploadAltLoading}
            />
          </div>

          <div className="viewer-canvas-wrap">
          {selectedPage && (() => {
            const ez = fitZoom * zoom
            const rad = rotation * Math.PI / 180
            const absC = Math.abs(Math.cos(rad))
            const absS = Math.abs(Math.sin(rad))
            const imageVisualW = imageSize.width > 0 && imageSize.height > 0
              ? ez * (imageSize.width * absC + imageSize.height * absS)
              : 0
            const imageVisualH = imageSize.width > 0 && imageSize.height > 0
              ? ez * (imageSize.width * absS + imageSize.height * absC)
              : 0
            // Board padding: extra space around image so any corner can be scrolled to center
            const sizerW = imageVisualW > 0 ? imageVisualW * 2 : 0
            const sizerH = imageVisualH > 0 ? imageVisualH * 2 : 0

            return (
              <div className="viewer-image-region" ref={imageRegionRef}>
                <div className="viewer-image-wrapper">
                  <div
                    className="viewer-image-sizer"
                    style={{
                      width: sizerW > 0 ? sizerW : undefined,
                      height: sizerH > 0 ? sizerH : undefined,
                    }}
                  >
                    <div
                      className="viewer-image-content"
                      style={{
                        width: imageSize.width || undefined,
                        height: imageSize.height || undefined,
                        transform: `scale(${ez}) rotate(${rotation}deg)`,
                        transformOrigin: 'center center',
                        left: imageSize.width ? (sizerW - imageSize.width) / 2 : 0,
                        top: imageSize.height ? (sizerH - imageSize.height) / 2 : 0,
                        visibility: baselineReady ? 'visible' : 'hidden',
                      }}
                    >
                      <img
                        src={currentBackgroundImageUrl ?? ''}
                        alt={backgroundView === 'satellite' ? `Page ${selectedPage.page_number} (alternate)` : `Page ${selectedPage.page_number}`}
                        onLoad={handleImageLoad}
                        className="viewer-image"
                        style={{
                          width: imageSize.width || undefined,
                          height: imageSize.height || undefined,
                        }}
                      />
                      {imageSize.width > 0 && imageSize.height > 0 && (pendingNotePos || editingNoteId) && (() => {
                        let left: number, top: number, isNew: boolean, activeColor: string, noteIdForDelete: string | null = null
                        const baseWidth = 420
                        const uiScale = ez > 0 ? 1 / ez : 1
                        if (noteEditorDragging && noteEditorDragPosition) {
                          left = noteEditorDragPosition.x * imageSize.width
                          top = noteEditorDragPosition.y * imageSize.height + 8
                          isNew = !!pendingNotePos
                          activeColor = pendingNotePos ? noteColor : (currentPageNotes.find(n => n.id === editingNoteId)?.color ?? noteColor)
                          noteIdForDelete = editingNoteId ? (currentPageNotes.find(n => n.id === editingNoteId)?.id ?? null) : null
                        } else if (pendingNotePos) {
                          left = pendingNotePos.x * imageSize.width
                          top = pendingNotePos.y * imageSize.height + 8
                          isNew = true
                          activeColor = noteColor
                        } else {
                          const note = currentPageNotes.find(n => n.id === editingNoteId)
                          if (!note) return null
                          left = note.x * imageSize.width
                          top = note.y * imageSize.height + 8
                          isNew = false
                          activeColor = note.color
                          noteIdForDelete = note.id
                        }
                        return (
                          <div
                            style={{
                              position: 'absolute',
                              left,
                              top,
                              transform: `translate(-50%, 0) scale(${uiScale})`,
                              transformOrigin: 'top center',
                              background: '#ffffff',
                              borderRadius: 8,
                              border: '1px solid #e5e7eb',
                              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)',
                              padding: '12px 14px 14px',
                              width: baseWidth,
                              zIndex: 40,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                                cursor: noteEditorDragging ? 'grabbing' : 'grab',
                                userSelect: 'none',
                              }}
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                if (noteEditorDragging) return
                                const editingNote = !pendingNotePos ? currentPageNotes.find(n => n.id === editingNoteId) : null
                                const startNX = pendingNotePos ? pendingNotePos.x : editingNote!.x
                                const startNY = pendingNotePos ? pendingNotePos.y : editingNote!.y
                                noteEditorDragRef.current = {
                                  startClientX: e.clientX,
                                  startClientY: e.clientY,
                                  startNX: startNX,
                                  startNY: startNY,
                                  currentNX: startNX,
                                  currentNY: startNY,
                                  isNew: !!pendingNotePos,
                                  noteId: editingNoteId ?? undefined,
                                }
                                setNoteEditorDragPosition({ x: startNX, y: startNY })
                                setNoteEditorDragging(true)
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span
                                  style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: 3,
                                    backgroundColor: activeColor,
                                    border: '1px solid rgba(0,0,0,0.3)',
                                  }}
                                />
                                <span style={{ fontSize: 11, color: '#6b7280' }}>{isNew ? 'New Note' : 'Edit Note'}</span>
                              </div>
                              {!isNew && noteIdForDelete && (
                                <button
                                  type="button"
                                  onClick={() => { handleNoteDelete(noteIdForDelete!); setEditingNoteId(null) }}
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#9ca3af',
                                    cursor: 'pointer',
                                    fontSize: 11,
                                  }}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              value={editingNoteDraft}
                              onChange={(e) => setEditingNoteDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleNoteSubmit()
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault()
                                  handleNoteDismiss()
                                }
                              }}
                              autoFocus
                              placeholder="Type note text and press Enter"
                              style={{
                                marginTop: 6,
                                fontSize: 15,
                                padding: '9px 12px',
                                borderRadius: 6,
                                border: '1px solid #d1d5db',
                                outline: 'none',
                                width: '100%',
                              }}
                            />
                          </div>
                        )
                      })()}

                      {/* Notes overlay: HTML so zoom doesn't redraw them; fixed screen size via scale(1/ez) */}
                      {imageSize.width > 0 && imageSize.height > 0 && currentPageNotes.length > 0 && (
                        <div
                          className="viewer-notes-overlay"
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            width: imageSize.width,
                            height: imageSize.height,
                            pointerEvents: 'none',
                            zIndex: 30,
                          }}
                        >
                          {currentPageNotes.map((note) => {
                            const pos = noteDraggingId === note.id && noteDragPosition
                              ? noteDragPosition
                              : { x: note.x, y: note.y }
                            return (
                              <div
                                key={note.id}
                                role="button"
                                tabIndex={0}
                                style={{
                                  position: 'absolute',
                                  left: `${pos.x * 100}%`,
                                  top: `${pos.y * 100}%`,
                                  transform: `translate(-50%, -50%) scale(${ez > 0 ? 1 / ez : 1})`,
                                  transformOrigin: 'center center',
                                  width: 'max-content',
                                  maxWidth: 240,
                                  minHeight: 24,
                                  padding: '6px 8px',
                                  boxSizing: 'border-box',
                                  background: note.color + '30',
                                  border: `1px solid ${note.color}99`,
                                  borderRadius: 2,
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                  fontSize: 12,
                                  color: '#333',
                                  fontFamily: 'Inter, system-ui, sans-serif',
                                  overflow: 'hidden',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  pointerEvents: 'auto',
                                  cursor: noteDraggingId === note.id ? 'grabbing' : 'grab',
                                  userSelect: 'none',
                                  backdropFilter: 'blur(1px)',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedNoteId(note.id)
                                  handleNoteEdit(note.id)
                                }}
                                onMouseDown={(e) => {
                                  if (e.button !== 0) return
                                  e.stopPropagation()
                                  noteCardDragRef.current = {
                                    noteId: note.id,
                                    startClientX: e.clientX,
                                    startClientY: e.clientY,
                                    startNX: note.x,
                                    startNY: note.y,
                                    currentNX: note.x,
                                    currentNY: note.y,
                                  }
                                  setNoteDragPosition({ x: note.x, y: note.y })
                                  setNoteDraggingId(note.id)
                                }}
                              >
                                {note.text || ' '}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {imageSize.width > 0 && imageSize.height > 0 && (
                        <ViewerCanvas
                          key={`canvas-${selectedPage.id}`}
                          width={imageSize.width}
                          height={imageSize.height}
                          countItems={pageCountItems}
                          countDefinitions={countDefinitions}
                          activeCountId={activeCountId}
                          panMode={panMode}
                          scale={scale}
                          isCalibrated={isCalibrated}
                          onCountItemCreated={handleCountItemCreated}
                          onCountItemDeleted={handleCountItemDeleted}
                          onCountItemUpdated={handleCountItemUpdated}
                          onCountItemRestoredByRedo={handleCountItemRestoredByRedo}
                          onCountItemsBatchCreated={handleCountItemsBatchCreated}
                          onCountItemsBatchDeleted={handleCountItemsBatchDeleted}
                          onCountItemsBatchMoved={handleCountItemsBatchMoved}
                          pageId={selectedPage.id}
                          showCounts={countsVisible}
                          hiddenCountIds={hiddenCountIds}
                          effectiveZoom={ez}
                          isCalibrating={isCalibrating}
                          onCalibrationComplete={handleCalibrationComplete}
                          rotation={rotation}
                          onDrawingStateChange={handleDrawingStateChange}
                          vertexUndoRef={vertexUndoRef}
                          vertexRedoRef={vertexRedoRef}
                          hasVertexRedoRef={hasVertexRedoRef}
                          resetDrawingRef={resetDrawingRef}
                          reopenDrawing={reopenDrawing}
                          onReopenConsumed={() => setReopenDrawing(null)}
                          noteMode={noteMode}
                          noteColor={noteColor}
                          onNoteCreated={handleNoteCreated}
                          eraseMode={eraseMode}
                          showNoteEditor={!!(pendingNotePos || editingNoteId)}
                          onDismissNoteEditor={handleNoteDismiss}
                          onCanvasClick={() => setSelectedNoteId(null)}
                          onSaveStart={markSaving}
                          onSaveEnd={markSaved}
                          onSaveError={markSaveError}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
          </div>
        </div>

        <div className="viewer-counts-sidebar">
          <CountsPanel
            countDefinitions={countDefinitions}
            countItems={countItems}
            selectedPage={selectedPage}
            activeCountId={activeCountId}
            onActiveCountChange={setActiveCountId}
            onCountDefinitionCreated={handleCountDefinitionCreated}
            onCountDefinitionUpdated={handleCountDefinitionUpdated}
            onCountDefinitionDeleted={handleCountDefinitionDeleted}
            planSetId={planSetId}
            onAddToDataset={async (trade, countDefId) => {
              if (!selectedPage) return
              try {
                const { addPageToDataset } = await import('../api')
                await addPageToDataset(selectedPage.id, trade, countDefId)
                alert('Page added to dataset successfully')
              } catch (err) {
                alert('Failed to add to dataset: ' + (err as Error).message)
              }
            }}
            scale={scale}
            onScaleChange={setScale}
            hiddenCountIds={hiddenCountIds}
            onHiddenCountIdsChange={setHiddenCountIds}
            isCalibrated={isCalibrated}
            isCalibrating={isCalibrating}
            onStartCalibration={handleStartCalibration}
            onCancelCalibration={handleCancelCalibration}
            calibrationPixelDist={calibrationPixelDist}
            onCalibrationSaved={handleCalibrationSaved}
            selectedCountIds={selectedCountIds}
            onSelectedCountIdsChange={setSelectedCountIds}
            pageExtraImages={pageExtraImages}
            activeExtraImageId={activeExtraImageId}
            onActiveExtraImageChange={(id) => {
              setActiveExtraImageId(id)
              setBackgroundView(id != null ? 'satellite' : 'plan')
            }}
            onRenameExtraImage={async (id, name) => {
              if (!selectedPage) return
              await renamePlanPageExtraImage(selectedPage.id, id, name)
              const data = await loadPlanSet()
              const nextPage = data?.pages?.find((p) => p.id === selectedPage.id)
              if (nextPage) setSelectedPage(nextPage)
            }}
            onDeleteExtraImage={async (id) => {
              if (!selectedPage) return
              // If deleting currently active background, switch back to plan
              if (activeExtraImageId === id) {
                setActiveExtraImageId(null)
                setBackgroundView('plan')
              }
              await deletePlanPageExtraImage(selectedPage.id, id)
              const data = await loadPlanSet()
              const nextPage = data?.pages?.find((p) => p.id === selectedPage.id)
              if (nextPage) setSelectedPage(nextPage)
            }}
            onUploadAltClick={() => uploadAltInputRef.current?.click()}
            uploadAltLoading={uploadAltLoading}
            onDetectionsReceived={async (result: AutoDetectResult) => {
              // Refetch definitions and items from the server so the UI shows
              // exactly what was saved (same as after refresh). This fixes
              // the mismatch where the button showed one count type but
              // refresh showed all.
              if (selectedPage && !Number.isNaN(planSetId)) {
                try {
                  const [defs, items] = await Promise.all([
                    fetchCountDefinitions(planSetId),
                    fetchCountItems(undefined, selectedPage.id),
                  ])
                  setCountDefinitions(defs)
                  const deepItems = items.map((i) => ({
                    ...i,
                    geometry: i.geometry.map((coord: number[]) => [...coord]),
                  }))
                  setCountItems(deepItems)
                  setHistory([deepItems.map((i) => ({ ...i, geometry: i.geometry.map((c: number[]) => [...c]) }))])
                  setHistoryIndex(0)
                  pageHistoryRef.current.set(selectedPage.id, {
                    history: [deepItems.map((i) => ({ ...i, geometry: i.geometry.map((c: number[]) => [...c]) }))],
                    historyIndex: 0,
                  })
                  countItemsRef.current = deepItems.map((i) => ({ ...i, geometry: i.geometry.map((c: number[]) => [...c]) }))
                } catch (err) {
                  console.error('Refetch after auto-detect failed:', err)
                  if (result.definitions_created?.length) {
                    for (const def of result.definitions_created) {
                      handleCountDefinitionCreated(def)
                    }
                  }
                  const removedSet = new Set(result.removed_ids ?? [])
                  const kept = removedSet.size > 0 ? countItems.filter((i) => !removedSet.has(i.id)) : countItems
                  if (result.items_created?.length) {
                    setCountItems([...kept, ...result.items_created])
                    pushHistory([...kept, ...result.items_created])
                  } else if (removedSet.size > 0) {
                    setCountItems(kept)
                    pushHistory(kept)
                  }
                }
              }
            }}
          />
        </div>
      </main>

      {/* Keyboard & mouse shortcuts helper */}
      {shortcutsOpen && (
        <div
          className="viewer-shortcuts-overlay"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            className="viewer-shortcuts-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="viewer-shortcuts-close"
              onClick={() => setShortcutsOpen(false)}
              aria-label="Close shortcuts"
            >
              <CloseIcon size={16} />
            </button>
            <h3 className="viewer-shortcuts-title">Keyboard & mouse shortcuts</h3>
            <div className="viewer-shortcuts-section">
              <h4>Selection & movement</h4>
              <ul>
                <li><kbd>Click</kbd> any shape, line, area, or marker to select it</li>
                <li><kbd>Shift + Click</kbd> to add/remove items from selection (multi-select)</li>
                <li><kbd>Delete</kbd> or <kbd>Backspace</kbd>: delete all selected items</li>
                <li><kbd>Click + drag</kbd> a selected item to move it (moves all selected)</li>
                <li><kbd>Arrow keys</kbd>: nudge selected item(s) by small increments</li>
                <li><kbd>Shift + Arrow keys</kbd>: nudge by larger increments</li>
                <li><kbd>Ctrl/Cmd + C</kbd>: copy selected item(s)</li>
                <li><kbd>Ctrl/Cmd + V</kbd>: paste copied item(s) (offset from original)</li>
                <li><kbd>Click empty space</kbd>: deselect</li>
              </ul>
            </div>
            <div className="viewer-shortcuts-section">
              <h4>Drawing lines & areas</h4>
              <ul>
                <li><kbd>Click</kbd> to place vertices for lines and polygons</li>
                <li><kbd>Double‑click</kbd> on a line/polygon segment to add a vertex (dot)</li>
                <li><kbd>Double‑click</kbd> or <kbd>Enter</kbd>: finish current line/area</li>
                <li><kbd>Esc</kbd>: finish or cancel the current shape</li>
                <li><kbd>Backspace</kbd> or <kbd>Delete</kbd> while drawing: remove last vertex</li>
                <li><kbd>Ctrl/Cmd + Z</kbd> while drawing: undo last vertex</li>
                <li><kbd>Ctrl/Cmd + Y</kbd> or <kbd>Ctrl/Cmd + Shift + Z</kbd>: redo undone vertex</li>
                <li>For polygons: click near first vertex to close the shape</li>
              </ul>
            </div>
            <div className="viewer-shortcuts-section">
              <h4>Drawing markers (Each type)</h4>
              <ul>
                <li><kbd>Click</kbd>: place a point marker</li>
                <li><kbd>Click + drag</kbd>: draw a shape (circle, square, or triangle)</li>
                <li>Drag rotation handle (when selected) to rotate shapes</li>
              </ul>
            </div>
            <div className="viewer-shortcuts-section">
              <h4>Editing existing shapes</h4>
              <ul>
                <li><kbd>Drag vertex handles</kbd> to reshape lines and polygons</li>
                <li><kbd>Select vertex</kbd> then <kbd>Delete</kbd>: remove that vertex</li>
                <li><kbd>C</kbd> then <kbd>click shape</kbd>: quick delete (no confirmation)</li>
                <li><kbd>Select item</kbd> then <kbd>Delete</kbd>: delete entire shape</li>
              </ul>
            </div>
            <div className="viewer-shortcuts-section">
              <h4>Undo & redo</h4>
              <ul>
                <li><kbd>Ctrl/Cmd + Z</kbd>: undo last action</li>
                <li><kbd>Ctrl/Cmd + Y</kbd> or <kbd>Ctrl/Cmd + Shift + Z</kbd>: redo last undone action</li>
                <li>Undo/redo buttons in toolbar also work</li>
              </ul>
            </div>
            <div className="viewer-shortcuts-section">
              <h4>View & navigation</h4>
              <ul>
                <li><kbd>Space</kbd> (hold): temporarily enable pan mode</li>
                <li><kbd>Ctrl/Cmd + Mouse wheel</kbd>: zoom in/out</li>
                <li><kbd>Ctrl + drag</kbd>: pan the canvas</li>
                <li><kbd>Fit button</kbd>: reset zoom to fit current sheet</li>
                <li><kbd>Rotate button</kbd>: rotate sheet 90° clockwise</li>
              </ul>
            </div>
            <div className="viewer-shortcuts-section">
              <h4>Notes</h4>
              <ul>
                <li><kbd>T</kbd> or <kbd>Ctrl/Cmd + T</kbd>: toggle note mode</li>
                <li><kbd>Click</kbd> in note mode: place a colored note (16 colors available)</li>
                <li><kbd>Click</kbd> a note: edit its text</li>
                <li>Notes appear as transparent sticky notes</li>
              </ul>
            </div>
            <div className="viewer-shortcuts-section">
              <h4>Area & Perimeter shortcuts</h4>
              <ul>
                <li><kbd>R</kbd>: toggle rectangle mode — 2 clicks to create rectangular polygon</li>
                <li><kbd>C</kbd>: toggle circle mode — 2 clicks (center + edge) to create circle polygon</li>
              </ul>
            </div>
            <div className="viewer-shortcuts-section">
              <h4>Erase tool</h4>
              <ul>
                <li><kbd>E</kbd>: toggle erase mode (click any shape to delete it)</li>
                <li><kbd>R</kbd> while in erase mode: only delete rectangular polygons (toggle)</li>
                <li><kbd>C</kbd> while in erase mode: only delete circle shapes (toggle)</li>
                <li>Press <kbd>R</kbd> or <kbd>C</kbd> again to clear the filter</li>
                <li>Click the eraser icon or press <kbd>E</kbd> again to exit erase mode</li>
              </ul>
            </div>
            <div className="viewer-shortcuts-section">
              <h4>Calibration</h4>
              <ul>
                <li>Click calibration button, then click two points on a known distance</li>
                <li>Enter the real-world distance to enable measurements</li>
                <li><kbd>Esc</kbd> during calibration: cancel</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        className="viewer-shortcuts-fab"
        onClick={() => setShortcutsOpen(true)}
        title="Show keyboard & mouse shortcuts"
        aria-label="Show keyboard and mouse shortcuts"
      >
        <KeyboardIcon size={18} />
      </button>

      {exportPdfModalOpen && planSet?.pages && (
        <div
          className="viewer-export-pdf-overlay"
          onClick={() => !exportPdfLoading && setExportPdfModalOpen(false)}
        >
          <div
            className="viewer-export-pdf-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="viewer-export-pdf-modal-header">
              <h3>Export PDF</h3>
              <button
                type="button"
                className="viewer-export-pdf-modal-close"
                onClick={() => !exportPdfLoading && setExportPdfModalOpen(false)}
                aria-label="Close"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <p className="viewer-export-pdf-modal-hint">Select which pages to include in the PDF.</p>
            <label className="viewer-export-pdf-filter-label">
              <input
                type="checkbox"
                checked={exportPdfFilterWithContentOnly}
                onChange={(e) => setExportPdfFilterWithContentOnly(e.target.checked)}
              />
              Only show pages with counts or notes
            </label>
            <div className="viewer-export-pdf-page-list">
              {(exportPdfFilterWithContentOnly
                ? planSet.pages.filter((p) => pageHasCountsOrNotes(p.id))
                : planSet.pages
              )
                .sort((a, b) => a.page_number - b.page_number)
                .map((p) => (
                  <label key={p.id} className="viewer-export-pdf-page-row">
                    <input
                      type="checkbox"
                      checked={exportPdfSelectedPageIds.has(p.id)}
                      onChange={(e) => {
                        setExportPdfSelectedPageIds((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(p.id)
                          else next.delete(p.id)
                          return next
                        })
                      }}
                    />
                    <span>{p.title || `Sheet ${p.page_number}`}</span>
                    {(exportPdfAllCountItems.some((i) => i.page === p.id) || (notes.get(p.id)?.length ?? 0) > 0) && (
                      <span className="viewer-export-pdf-page-badge">has content</span>
                    )}
                  </label>
                ))}
            </div>
            {planSet.pages.length > 0 && (
              <div className="viewer-export-pdf-actions">
                <button
                  type="button"
                  className="viewer-export-pdf-btn-inline"
                  onClick={() =>
                    setExportPdfSelectedPageIds(
                      new Set(
                        (exportPdfFilterWithContentOnly
                          ? planSet.pages.filter((p) => pageHasCountsOrNotes(p.id))
                          : planSet.pages
                        ).map((p) => p.id)
                      )
                    )
                  }
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="viewer-export-pdf-btn-inline"
                  onClick={() => setExportPdfSelectedPageIds(new Set())}
                >
                  Deselect all
                </button>
              </div>
            )}
            <div className="viewer-export-pdf-modal-footer">
              <button
                type="button"
                className="viewer-export-pdf-btn-inline"
                onClick={() => !exportPdfLoading && setExportPdfModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="viewer-export-pdf-export-btn"
                disabled={exportPdfLoading || exportPdfSelectedPageIds.size === 0}
                onClick={() => handleExportPdf(Array.from(exportPdfSelectedPageIds))}
              >
                {exportPdfLoading && exportPdfProgress
                  ? `Exporting ${exportPdfProgress.current}/${exportPdfProgress.total}…`
                  : `Export ${exportPdfSelectedPageIds.size} page(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {excelModalOpen && (
        <ExcelPreviewModal
          planSetId={planSetId}
          onClose={() => setExcelModalOpen(false)}
          exportCountsExcel={exportCountsExcel}
        />
      )}
    </div>
  )
}
