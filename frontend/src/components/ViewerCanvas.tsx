import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { Stage, Layer, Line, Circle, Ellipse, Rect, RegularPolygon, Group, Text, Image, Transformer } from 'react-konva'
import type { CountItem, CountDefinition } from '../api'
import { createCountItem, deleteCountItem, updateCountItem, MEDIA_BASE } from '../api'
import './ViewerCanvas.css'

/* ═══════════════════════════════════════════════════════════
 *  TYPES
 * ═══════════════════════════════════════════════════════════ */

interface ViewerCanvasProps {
  width: number
  height: number
  countItems: CountItem[]
  countDefinitions: CountDefinition[]
  activeCountId: number | null
  panMode: boolean
  scale: { realWorldFeet: number; pixelDistance: number }
  isCalibrated: boolean
  onCountItemCreated: (item: CountItem) => void
  onCountItemDeleted: (id: number) => void
  onCountItemUpdated: (item: CountItem) => void
  onCountItemRestoredByRedo?: (item: CountItem) => void
  onCountItemsBatchCreated?: (items: CountItem[]) => void
  onCountItemsBatchDeleted?: (ids: number[]) => void
  onCountItemsBatchMoved?: (updates: { id: number; item: CountItem }[]) => void
  pageId: number
  showCounts: boolean
  hiddenCountIds: Set<number>
  effectiveZoom: number
  isCalibrating: boolean
  onCalibrationComplete: (pixelDist: number) => void
  rotation: number
  onDrawingStateChange?: (isDrawing: boolean) => void
  vertexUndoRef?: React.MutableRefObject<(() => void) | null>
  vertexRedoRef?: React.MutableRefObject<(() => void) | null>
  hasVertexRedoRef?: React.MutableRefObject<() => boolean>
  resetDrawingRef?: React.MutableRefObject<(() => void) | null>
  reopenDrawing?: { type: 'drawing_polyline' | 'drawing_polygon'; vertices: number[][]; redoStack?: number[][] } | null
  onReopenConsumed?: () => void
  noteMode?: boolean
  noteColor?: string
  onNoteCreated?: (x: number, y: number) => void
  showNoteEditor?: boolean
  onDismissNoteEditor?: () => void
  onCanvasClick?: () => void
  onSaveStart?: () => void
  onSaveEnd?: () => void
  onSaveError?: () => void
  eraseMode?: boolean
  overlayImage?: {
    url: string
    scale: number
    offset_x: number
    offset_y: number
  } | null
  overlayEditing?: boolean
  onOverlayTransformChange?: (transform: { scale: number; offset_x: number; offset_y: number }) => void
}

type DrawingState =
  | { type: 'idle' }
  | { type: 'drawing_polyline'; vertices: number[][] }
  | { type: 'drawing_polygon'; vertices: number[][] }
  | { type: 'drawing_rect'; start: [number, number] }
  | { type: 'drawing_rect_polygon'; start: [number, number] }
  | { type: 'drawing_circle_polygon'; center: [number, number] }

/* ═══════════════════════════════════════════════════════════
 *  CONSTANTS  —  all in CSS-screen-pixels
 *
 *  sz(N) converts N screen-pixels → canvas-pixels so that,
 *  after the parent CSS scale(effectiveZoom), the element
 *  always appears exactly N px on screen — zoom-independent.
 * ═══════════════════════════════════════════════════════════ */

const DBL_MS = 350
const DBL_PX = 14
const SEL_COLOR = '#2563eb' // Bright blue selection highlight (visible on any bg)

const S = {
  marker:       25,    // marker size in screen px (through sz()) so it looks the same on all resolutions
  vert:         4,      // vertex handle radius (screen px, via sz())
  vertHover:    7,      // vertex handle radius on hover/selected
  lineW:        2,      // polyline stroke (matches drawing preview feel)
  polyW:        2,      // polygon stroke
  hit:          12,     // invisible hit area
  snap:         22,     // snap-to-close distance
  crossArm:     18,     // crosshair arm length
  crossGap:     5,      // crosshair center gap
  dashOn:       10,
  dashOff:      5,
  font:         12,     // measurement label font (screen px, through sz())
  fontSm:       10,     // segment label font (screen px, through sz())
  pad:          3,      // label padding (screen px, through sz())
  calDot:       7,      // calibration endpoint dot
}

/* ═══════════════════════════════════════════════════════════
 *  FORMATTING HELPERS
 * ═══════════════════════════════════════════════════════════ */

function formatFt(feet: number): string {
  if (!isFinite(feet) || feet <= 0) return "0'"
  if (feet < 0.5) return `${Math.round(feet * 12)}"`
  const whole = Math.floor(feet)
  const inches = Math.round((feet - whole) * 12)
  if (inches === 12) return `${whole + 1}'`
  if (inches === 0) return `${whole}'`
  return `${whole}'-${inches}"`
}

function formatSqft(sqft: number): string {
  if (!isFinite(sqft) || sqft <= 0) return '0 sf'
  if (sqft >= 100) return `${Math.round(sqft).toLocaleString()} sf`
  if (sqft >= 1) return `${sqft.toFixed(1)} sf`
  return `${Math.round(sqft * 144)} sq in`
}

/* ═══════════════════════════════════════════════════════════
 *  COMPONENT
 * ═══════════════════════════════════════════════════════════ */

export default function ViewerCanvas({
  width,
  height,
  countItems,
  countDefinitions,
  activeCountId,
  panMode,
  scale,
  isCalibrated,
  onCountItemCreated,
  onCountItemDeleted,
  onCountItemUpdated,
  onCountItemRestoredByRedo,
  onCountItemsBatchCreated,
  onCountItemsBatchDeleted,
  onCountItemsBatchMoved,
  pageId,
  showCounts,
  hiddenCountIds,
  effectiveZoom,
  isCalibrating,
  onCalibrationComplete,
  rotation,
  onDrawingStateChange,
  vertexUndoRef,
  vertexRedoRef,
  hasVertexRedoRef,
  resetDrawingRef,
  reopenDrawing,
  onReopenConsumed,
  noteMode,
  noteColor,
  onNoteCreated,
  showNoteEditor,
  onDismissNoteEditor,
  onCanvasClick,
  onSaveStart,
  onSaveEnd,
  onSaveError,
  eraseMode = false,
  overlayImage,
  overlayEditing = false,
  onOverlayTransformChange,
}: ViewerCanvasProps) {

  async function trackedCreate(data: Parameters<typeof createCountItem>[0]) {
    onSaveStart?.()
    try {
      const result = await createCountItem(data)  // raw call inside wrapper
      onSaveEnd?.()
      return result
    } catch (err) {
      onSaveError?.()
      throw err
    }
  }

  async function trackedUpdate(id: number, data: Parameters<typeof updateCountItem>[1]) {
    onSaveStart?.()
    try {
      const result = await updateCountItem(id, data)  // raw call inside wrapper
      onSaveEnd?.()
      return result
    } catch (err) {
      onSaveError?.()
      throw err
    }
  }

  async function trackedDelete(id: number) {
    onSaveStart?.()
    try {
      await deleteCountItem(id)
      onSaveEnd?.()
    } catch (err) {
      onSaveError?.()
      throw err
    }
  }

  /* ─── State ─── */

  const [drawingState, setDrawingState] = useState<DrawingState>({ type: 'idle' })
  const [hoveredVertex, setHoveredVertex] = useState<{ itemId: number; idx: number } | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set())
  const [selectedVertex, setSelectedVertex] = useState<{ itemId: number; idx: number } | null>(null)
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
  const [cPressed, setCPressed] = useState(false)
  const [spacePressed, setSpacePressed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [rectPolygonMode, setRectPolygonMode] = useState(false)
  const [circlePolygonMode, setCirclePolygonMode] = useState(false)
  const [eraseFilter, setEraseFilter] = useState<'all' | 'rect' | 'circle'>('all')
  const [multiDragOffset, setMultiDragOffset] = useState<{ dx: number; dy: number } | null>(null)
  const clipboardRef = useRef<CountItem[] | CountItem | null>(null)
  const stageRef = useRef<any>(null)
  const lastClickTimeRef = useRef(0)
  const lastClickPosRef = useRef<{ x: number; y: number } | null>(null)
  const countItemsRef = useRef<CountItem[]>(countItems)
  const selectedItemIdsRef = useRef<Set<number>>(new Set())
  const selectedItemIdsAtDragStartRef = useRef<Set<number>>(new Set())
  const draggedItemIdRef = useRef<number | null>(null)
  const dragJustEndedRef = useRef(false)
  const completingDragRef = useRef(false)
  const multiDragPointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const multiDragRafRef = useRef<number | null>(null)
  const lastDragActivityTimeRef = useRef(0)
  const recentlyMovedIdsRef = useRef<Set<number>>(new Set())
  const singleDragStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const multiDragBasesRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const multiDragStartAbsoluteRef = useRef<{ x: number; y: number } | null>(null)
  const multiDragOffsetRef = useRef<{ dx: number; dy: number } | null>(null)
  const forceGroupZeroIdRef = useRef<number | null>(null)
  const DRAG_GUARD_MS = 800
  const DRAG_DELETE_BLOCK_MS = 1200
  const RECENTLY_MOVED_BLOCK_MS = 2200
  const DRAG_DISTANCE_PX = 6

  // Vertex-level redo stack (cleared when new vertex is added)
  const vertexRedoStackRef = useRef<number[][]>([])

  // Track which drawing type was last used (for redo from idle)
  const lastDrawingTypeRef = useRef<'drawing_polyline' | 'drawing_polygon' | null>(null)
  useEffect(() => {
    if (drawingState.type === 'drawing_polyline' || drawingState.type === 'drawing_polygon') {
      lastDrawingTypeRef.current = drawingState.type
    }
  }, [drawingState.type])

  // Expose vertex undo/redo to parent via refs
  useEffect(() => {
    if (vertexUndoRef) {
      vertexUndoRef.current = () => {
        if (drawingState.type === 'drawing_polyline' || drawingState.type === 'drawing_polygon') {
          const v = drawingState.vertices
          if (v.length === 0) {
            setDrawingState({ type: 'idle' })
          } else if (v.length === 1) {
            vertexRedoStackRef.current.push(v[0])
            setDrawingState({ type: 'idle' })
          } else {
            vertexRedoStackRef.current.push(v[v.length - 1])
            setDrawingState({ ...drawingState, vertices: v.slice(0, -1) })
          }
        } else if (drawingState.type === 'drawing_rect') {
          setDrawingState({ type: 'idle' })
        }
      }
    }
    if (vertexRedoRef) {
      vertexRedoRef.current = () => {
        if (vertexRedoStackRef.current.length === 0) return
        const redo = vertexRedoStackRef.current.pop()!
        if (drawingState.type === 'drawing_polyline' || drawingState.type === 'drawing_polygon') {
          const newVerts = [...drawingState.vertices, redo]
          setDrawingState({ ...drawingState, vertices: newVerts })
          // If that was the last vertex on the redo stack, auto-finish the shape so we're not stuck in drawing mode.
          // Use isRedoRestore so parent advances history instead of pushing (keeps remaining redos).
          if (vertexRedoStackRef.current.length === 0) {
            if (drawingState.type === 'drawing_polyline' && newVerts.length >= 2) {
              void finishPolyline(newVerts, true)
            } else if (drawingState.type === 'drawing_polygon' && newVerts.length >= 3) {
              void finishPolygon(newVerts, true)
            }
          }
        } else if (drawingState.type === 'idle' && lastDrawingTypeRef.current) {
          // Re-enter drawing mode from idle with the redo vertex
          setDrawingState({ type: lastDrawingTypeRef.current, vertices: [redo] })
        }
      }
    }
  }, [drawingState, vertexUndoRef, vertexRedoRef])

  // Expose whether vertex redo stack has items
  useEffect(() => {
    if (hasVertexRedoRef) {
      hasVertexRedoRef.current = () => vertexRedoStackRef.current.length > 0
    }
  })

  // Expose reset drawing so parent can exit drawing mode (e.g. after history redo)
  useEffect(() => {
    if (resetDrawingRef) {
      resetDrawingRef.current = () => {
        vertexRedoStackRef.current = []
        setDrawingState({ type: 'idle' })
      }
    }
    return () => { if (resetDrawingRef) resetDrawingRef.current = null }
  }, [resetDrawingRef])

  // Calibration
  const [calPoint1, setCalPoint1] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => { if (!isCalibrating) setCalPoint1(null) }, [isCalibrating])

  // Notify parent of drawing state
  useEffect(() => {
    onDrawingStateChange?.(drawingState.type !== 'idle')
  }, [drawingState.type])

  // Reopen a completed shape for editing (triggered by parent undo/redo)
  useEffect(() => {
    if (reopenDrawing) {
      setDrawingState({ type: reopenDrawing.type, vertices: reopenDrawing.vertices })
      vertexRedoStackRef.current = reopenDrawing.redoStack ?? []
      onReopenConsumed?.()
    }
  }, [reopenDrawing])

  /* ─── Derived ─── */

  const activeCount = countDefinitions.find((d) => d.id === activeCountId)
  const isDrawingMode = !isCalibrating && showCounts && activeCount != null && !panMode && !spacePressed && !noteMode && !eraseMode
  const isLineOrPolygonTool = activeCount && (activeCount.count_type === 'linear_feet' || activeCount.count_type === 'area_perimeter')
  const showCrosshair = isDrawingMode && activeCount && activeCount.count_type !== 'each' &&
    (drawingState.type === 'drawing_polyline' || drawingState.type === 'drawing_polygon' || drawingState.type === 'drawing_rect_polygon' || drawingState.type === 'drawing_circle_polygon' ||
      (drawingState.type === 'idle' && isLineOrPolygonTool))

  // Reset rect/circle polygon mode when switching away from area_perimeter
  useEffect(() => {
    if (!activeCount || activeCount.count_type !== 'area_perimeter') {
      setRectPolygonMode(false)
      setCirclePolygonMode(false)
    }
  }, [activeCount?.id, activeCount?.count_type])

  /**
   * sz(N) → canvas-space pixels so the element looks exactly N screen-px
   * after the parent CSS transform: scale(effectiveZoom).
   */
  const sz = useMemo(() => {
    const z = Math.max(effectiveZoom, 0.01)
    return (px: number) => px / z
  }, [effectiveZoom])

  /**
   * getCanvasPointer(evt) → correct canvas-space coordinates accounting for
   * CSS rotation + scale. Replaces Konva's getPointerPosition() which breaks
   * when CSS rotation is applied to the parent container.
   */
  function getCanvasPointer(evt: MouseEvent): { x: number; y: number } | null {
    const stage = stageRef.current
    if (!stage) return null
    const container = stage.container()
    const rect = container.getBoundingClientRect()

    const screenCx = rect.left + rect.width / 2
    const screenCy = rect.top + rect.height / 2

    const dx = evt.clientX - screenCx
    const dy = evt.clientY - screenCy

    const rad = -rotation * Math.PI / 180
    const cosR = Math.cos(rad)
    const sinR = Math.sin(rad)

    const ux = dx * cosR - dy * sinR
    const uy = dx * sinR + dy * cosR

    return {
      x: ux / effectiveZoom + width / 2,
      y: uy / effectiveZoom + height / 2,
    }
  }

  /** Feet per native-image-pixel (based on calibration). */
  const fpp = scale.realWorldFeet / scale.pixelDistance

  // Keep countItems ref in sync
  useEffect(() => {
    countItemsRef.current = countItems
  }, [countItems])

  // Keep selectedItemIds ref in sync for drag handler
  useEffect(() => {
    selectedItemIdsRef.current = selectedItemIds
  }, [selectedItemIds])

  /** Visible items. */
  const visibleItems = showCounts
    ? countItems.filter((item) => !hiddenCountIds.has(item.count_definition))
    : []

  /* ─── Coordinate helpers ─── */

  function norm(x: number, y: number): [number, number] {
    return [x / width, y / height]
  }

  function denorm(nx: number, ny: number): [number, number] {
    return [nx * width, ny * height]
  }

  function dist(x1: number, y1: number, x2: number, y2: number) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
  }

  /** Distance from point (px,py) to line segment (x1,y1)-(x2,y2). Returns { dist, t } where t is 0..1 for closest point. */
  function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): { dist: number; t: number } {
    const dx = x2 - x1, dy = y2 - y1
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return { dist: dist(px, py, x1, y1), t: 0 }
    let t = ((px - x1) * dx + (py - y1) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const qx = x1 + t * dx
    const qy = y1 + t * dy
    return { dist: dist(px, py, qx, qy), t }
  }

  /** Find segment index and projected point for a specific item. Returns { segIdx, newVertex } or null. */
  function findSegmentAtPointForItem(itemId: number, pos: { x: number; y: number }): { segIdx: number; newVertex: [number, number] } | null {
    const item = countItems.find((i) => i.id === itemId)
    if (!item || (item.geometry_type !== 'polyline' && item.geometry_type !== 'polygon')) return null
    const verts = item.geometry_type === 'polygon' ? item.geometry.slice(0, -1) : item.geometry
    if (verts.length < 2) return null
    const threshold = sz(S.hit)
    let best: { segIdx: number; newVertex: [number, number]; d: number } | null = null
    for (let i = 0; i < verts.length - 1; i++) {
      const [nx1, ny1] = verts[i]
      const [nx2, ny2] = verts[i + 1]
      const [x1, y1] = denorm(nx1, ny1)
      const [x2, y2] = denorm(nx2, ny2)
      const { dist: d, t } = pointToSegmentDist(pos.x, pos.y, x1, y1, x2, y2)
      if (d < threshold && (best == null || d < best.d)) {
        const qx = x1 + t * (x2 - x1)
        const qy = y1 + t * (y2 - y1)
        best = { segIdx: i + 1, newVertex: norm(qx, qy), d }
      }
    }
    if (item.geometry_type === 'polygon' && verts.length >= 2) {
      const [nx1, ny1] = verts[verts.length - 1]
      const [nx2, ny2] = verts[0]
      const [x1, y1] = denorm(nx1, ny1)
      const [x2, y2] = denorm(nx2, ny2)
      const { dist: d, t } = pointToSegmentDist(pos.x, pos.y, x1, y1, x2, y2)
      if (d < threshold && (best == null || d < best.d)) {
        const qx = x1 + t * (x2 - x1)
        const qy = y1 + t * (y2 - y1)
        best = { segIdx: verts.length, newVertex: norm(qx, qy), d }
      }
    }
    return best ? { segIdx: best.segIdx, newVertex: best.newVertex } : null
  }

  function handleLineDblClick(itemId: number, e: any) {
    if (drawingState.type !== 'idle') return
    e.cancelBubble = true
    const pos = getCanvasPointer(e.evt)
    if (!pos) return
    const found = findSegmentAtPointForItem(itemId, pos)
    if (found) void addVertexToSegment(itemId, found.segIdx, found.newVertex)
  }

  async function addVertexToSegment(itemId: number, segIdx: number, newVertex: [number, number]) {
    const item = countItems.find((i) => i.id === itemId)
    if (!item || (item.geometry_type !== 'polyline' && item.geometry_type !== 'polygon')) return
    const g = [...item.geometry]
    g.splice(segIdx, 0, newVertex)
    if (item.geometry_type === 'polygon' && g.length >= 2) {
      g[g.length - 1] = [...g[0]]
    }
    const updates: Partial<CountItem> = { geometry: g }
    if (isCalibrated) {
      if (item.geometry_type === 'polyline') updates.length_ft = calcLength(g)
      else if (item.geometry_type === 'polygon') {
        updates.area_sqft = calcArea(g)
        updates.perimeter_ft = calcPerimeter(g)
      }
    } else {
      if (item.geometry_type === 'polyline') updates.length_ft = null
      else if (item.geometry_type === 'polygon') { updates.area_sqft = null; updates.perimeter_ft = null }
    }
    try { const u = await trackedUpdate(itemId, updates); onCountItemUpdated(u) }
    catch (err) { console.error('Add vertex failed:', err) }
  }

  /* ─── Measurement helpers ─── */

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

  /**
   * Offset an entire item's geometry by a canvas-space delta (dx, dy) and
   * persist the change via updateCountItem. Used for drag-move and arrow-key nudges.
   */
  async function offsetItemGeometry(itemId: number, dx: number, dy: number) {
    // Use ref to get latest items to avoid stale closures
    const item = countItemsRef.current.find((i) => i.id === itemId)
    if (!item) {
      console.warn('Item not found for drag:', itemId)
      return
    }

    // Calculate new geometry - deep copy to ensure independence
    const movedGeom = item.geometry.map(([nx, ny]) => {
      const [x, y] = denorm(nx, ny)
      return norm(x + dx, y + dy)
    })

    const updates: Partial<CountItem> = { geometry: movedGeom }
    if (isCalibrated) {
      if (item.geometry_type === 'polyline') {
        updates.length_ft = calcLength(movedGeom)
      } else if (item.geometry_type === 'polygon') {
        // ensure closed
        if (movedGeom.length >= 2) movedGeom[movedGeom.length - 1] = [...movedGeom[0]]
        updates.geometry = movedGeom
        updates.area_sqft = calcArea(movedGeom)
        updates.perimeter_ft = calcPerimeter(movedGeom)
      }
    } else {
      if (item.geometry_type === 'polyline') {
        updates.length_ft = null
      } else if (item.geometry_type === 'polygon') {
        if (movedGeom.length >= 2) movedGeom[movedGeom.length - 1] = [...movedGeom[0]]
        updates.geometry = movedGeom
        updates.area_sqft = null
        updates.perimeter_ft = null
      }
    }

    try {
      const u = await trackedUpdate(itemId, updates)
      
      // CRITICAL: Create finalItem using our calculated geometry, NOT the server response geometry
      // The server might return stale geometry, so we ALWAYS use movedGeom
      const finalItem: CountItem = { 
        ...item,  // Start with current item to preserve all fields (rotation_deg, etc.)
        ...u,     // Override with server response (has updated fields like timestamps)
        // CRITICAL: ALWAYS use our calculated geometry - this MUST come last to override any geometry from server
        geometry: movedGeom.map(coord => [...coord])  // Deep copy our calculated geometry
      }
      
      // Verify we're using the correct geometry (defensive check)
      if (finalItem.geometry.length !== movedGeom.length) {
        console.error('Geometry length mismatch!', finalItem.geometry.length, movedGeom.length)
        finalItem.geometry = movedGeom.map(coord => [...coord])
      }
      
      // Log the geometry update for debugging
      console.log('offsetItemGeometry: Updating position', {
        itemId,
        oldGeometry: item.geometry,
        newGeometry: movedGeom,
        dx,
        dy
      })
      
      // CRITICAL: Update local state and cache IMMEDIATELY
      // handleCountItemUpdated now updates cache synchronously (outside React batching)
      onCountItemUpdated(finalItem)
      
      // Small delay to ensure cache update completes
      await new Promise(resolve => setTimeout(resolve, 10))
      
      return finalItem
    } catch (err) {
      console.error('Move item failed:', err)
      throw err
    }
  }

  /** Centroid in canvas-space for label placement. */
  function centroid(verts: number[][]): [number, number] {
    const pts = (verts.length > 1 &&
      verts[verts.length - 1][0] === verts[0][0] &&
      verts[verts.length - 1][1] === verts[0][1])
      ? verts.slice(0, -1)
      : verts
    let cx = 0, cy = 0
    for (const [nx, ny] of pts) {
      const [x, y] = denorm(nx, ny)
      cx += x; cy += y
    }
    return [cx / pts.length, cy / pts.length]
  }

  /** Midpoint of a polyline in canvas-space. */
  function midpoint(verts: number[][]): [number, number] {
    if (verts.length === 0) return [0, 0]
    if (verts.length === 1) return denorm(verts[0][0], verts[0][1])
    const mi = Math.floor(verts.length / 2)
    const [x1, y1] = denorm(verts[mi - 1][0], verts[mi - 1][1])
    const [x2, y2] = denorm(verts[mi][0], verts[mi][1])
    return [(x1 + x2) / 2, (y1 + y2) / 2]
  }

  /* ═══════════════════════════════════════════════════════════
   *  KEYBOARD
   * ═══════════════════════════════════════════════════════════ */

  useEffect(() => {
    function onDown(e: KeyboardEvent) {
      // Don't interfere with input fields
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      
      // Handle copy/paste first before other handlers
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        // Copy selected item(s)
        if (selectedItemIds.size > 0 && drawingState.type === 'idle' && !isDragging) {
          e.preventDefault()
          e.stopImmediatePropagation()
          const items = countItems.filter((i) => selectedItemIds.has(i.id))
          if (items.length > 0) {
            clipboardRef.current = items.map((i) => JSON.parse(JSON.stringify(i)))
            console.log('Copied items:', items.length)
          }
          return
        }
      }
      
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        // Paste copied item(s) with slight offset
        if (!clipboardRef.current || drawingState.type !== 'idle' || isDragging) return
        e.preventDefault()
        e.stopImmediatePropagation()
        const srcItems = Array.isArray(clipboardRef.current) ? clipboardRef.current : [clipboardRef.current]
        const dx = sz(16)
        const dy = sz(16)
        const doPaste = async () => {
          try {
            const createdItems: CountItem[] = []
            for (let i = 0; i < srcItems.length; i++) {
              const src = srcItems[i]
              const newGeom = src.geometry.map((coord: number[]) => {
                const [nx, ny] = coord
                const [x, y] = denorm(nx, ny)
                return norm(x + dx, y + dy)
              })
              const base: Partial<CountItem> = {
                count_definition: src.count_definition,
                page: pageId,
                geometry_type: src.geometry_type,
                geometry: newGeom,
                rotation_deg: src.rotation_deg ?? 0,
              }
              if (isCalibrated) {
                if (src.geometry_type === 'polyline') {
                  base.length_ft = calcLength(newGeom)
                } else if (src.geometry_type === 'polygon') {
                  base.area_sqft = calcArea(newGeom)
                  base.perimeter_ft = calcPerimeter(newGeom)
                }
              }
              const item = await trackedCreate(base as any)
              createdItems.push(item)
            }
            if (onCountItemsBatchCreated && createdItems.length > 1) {
              onCountItemsBatchCreated(createdItems)
            } else {
              createdItems.forEach((item) => onCountItemCreated(item))
            }
            const nextIds = new Set(createdItems.map((i) => i.id))
            selectedItemIdsRef.current = nextIds
            setSelectedItemIds(nextIds)
          } catch (err) {
            console.error('Paste failed:', err)
            alert('Failed to paste: ' + (err as Error).message)
          }
        }
        void doPaste()
        return
      }
      // Ctrl+Z during drawing: remove last vertex (vertex-level undo)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (drawingState.type === 'drawing_polyline' || drawingState.type === 'drawing_polygon') {
          e.preventDefault()
          e.stopImmediatePropagation()
          const v = drawingState.vertices
          if (v.length <= 1) {
            vertexRedoStackRef.current.push(v[0])
            setDrawingState({ type: 'idle' })
          } else {
            vertexRedoStackRef.current.push(v[v.length - 1])
            setDrawingState({ ...drawingState, vertices: v.slice(0, -1) })
          }
          return
        }
        if (drawingState.type === 'drawing_rect') {
          e.preventDefault()
          e.stopImmediatePropagation()
          setDrawingState({ type: 'idle' })
          return
        }
      }

      // Ctrl+Y / Ctrl+Shift+Z during drawing: redo last undone vertex
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        if ((drawingState.type === 'drawing_polyline' || drawingState.type === 'drawing_polygon') && vertexRedoStackRef.current.length > 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          const redo = vertexRedoStackRef.current.pop()!
          setDrawingState({ ...drawingState, vertices: [...drawingState.vertices, redo] })
          return
        }
      }

      if (e.key === 'Escape') {
        if (drawingState.type === 'drawing_polyline' && drawingState.vertices.length >= 2)
          void finishPolyline(drawingState.vertices)
        else if (drawingState.type === 'drawing_polygon' && drawingState.vertices.length >= 3)
          void finishPolygon(drawingState.vertices)
        else if (drawingState.type === 'drawing_circle_polygon')
          setDrawingState({ type: 'idle' })
        else if (drawingState.type !== 'idle')
          setDrawingState({ type: 'idle' })
        const empty = new Set<number>()
        selectedItemIdsRef.current = empty
        setSelectedItemIds(empty)
        setSelectedVertex(null)
      } else if (e.key === 'Enter') {
        // Finish both polylines AND polygons
        if (drawingState.type === 'drawing_polyline' && drawingState.vertices.length >= 2)
          void finishPolyline(drawingState.vertices)
        else if (drawingState.type === 'drawing_polygon' && drawingState.vertices.length >= 3)
          void finishPolygon(drawingState.vertices)
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        if (isDragging || dragJustEndedRef.current || completingDragRef.current) return
        if (Date.now() - lastDragActivityTimeRef.current < DRAG_DELETE_BLOCK_MS) return
        if (selectedItemIds.size > 0 && anyRecentlyMoved(selectedItemIds)) return
        // During drawing: remove last vertex
        if (drawingState.type === 'drawing_polyline' || drawingState.type === 'drawing_polygon') {
          const v = drawingState.vertices
          if (v.length <= 1) setDrawingState({ type: 'idle' })
          else setDrawingState({ ...drawingState, vertices: v.slice(0, -1) })
        } else if (drawingState.type === 'drawing_rect' || drawingState.type === 'drawing_circle_polygon') {
          setDrawingState({ type: 'idle' })
        } else if (selectedVertex) {
          void removeVertex(selectedVertex.itemId, selectedVertex.idx)
        } else if (selectedItemIds.size > 0) {
          void deleteItems(new Set(selectedItemIds))
        }
      } else if (e.key === 'r' || e.key === 'R') {
        if (!e.ctrlKey && !e.metaKey) {
          if (eraseMode) {
            e.preventDefault()
            setEraseFilter((prev) => (prev === 'rect' ? 'all' : 'rect'))
          } else if (activeCount?.count_type === 'area_perimeter') {
            e.preventDefault()
            setRectPolygonMode((prev) => {
              if (!prev) setCirclePolygonMode(false)
              return !prev
            })
          }
        }
      } else if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) {
          if (eraseMode) {
            e.preventDefault()
            setEraseFilter((prev) => (prev === 'circle' ? 'all' : 'circle'))
            return
          }
          if (activeCount?.count_type === 'area_perimeter') {
            e.preventDefault()
            setCirclePolygonMode((prev) => {
              if (!prev) setRectPolygonMode(false)
              return !prev
            })
            return
          }
          setCPressed(true)
        }
      } else if (e.key === ' ') {
        e.preventDefault()
        setSpacePressed(true)
      } else if (
        drawingState.type === 'idle' &&
        !isDragging &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        // Nudge selected count item or note with arrow keys
        e.preventDefault()
        const stepScreen = e.shiftKey ? 10 : 2
        const delta = sz(stepScreen)
        let dx = 0
        let dy = 0
        if (e.key === 'ArrowLeft') dx = -delta
        else if (e.key === 'ArrowRight') dx = delta
        else if (e.key === 'ArrowUp') dy = -delta
        else if (e.key === 'ArrowDown') dy = delta

        if (selectedItemIds.size === 1) {
          const id = Array.from(selectedItemIds)[0]
          void offsetItemGeometry(id, dx, dy)
        } else if (selectedItemIds.size > 1) {
          void (async () => {
            const batchUpdates: { id: number; item: CountItem }[] = []
            for (const id of selectedItemIds) {
              const item = countItemsRef.current.find((i) => i.id === id)
              if (!item) continue
              const newGeom = item.geometry.map(([nx, ny]) => {
                const [x, y] = denorm(nx, ny)
                return norm(x + dx, y + dy)
              })
              const updates: Partial<CountItem> = { geometry: newGeom }
              if (isCalibrated) {
                if (item.geometry_type === 'polyline') updates.length_ft = calcLength(newGeom)
                else if (item.geometry_type === 'polygon') {
                  updates.area_sqft = calcArea(newGeom)
                  updates.perimeter_ft = calcPerimeter(newGeom)
                }
              }
              const u = await trackedUpdate(id, updates)
              batchUpdates.push({ id, item: u })
            }
            if (onCountItemsBatchMoved && batchUpdates.length > 0) {
              onCountItemsBatchMoved(batchUpdates)
            } else {
              batchUpdates.forEach(({ item }) => onCountItemUpdated(item))
            }
          })()
        }
      }
    }
    function onUp(e: KeyboardEvent) {
      if (e.key === ' ') setSpacePressed(false)
      else if (e.key === 'c' || e.key === 'C') setCPressed(false)
    }
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => { window.removeEventListener('keydown', onDown, true); window.removeEventListener('keyup', onUp, true) }
  }, [drawingState, selectedItemIds, selectedVertex, countItems, isCalibrated, pageId, sz, isDragging, onCountItemCreated, finishPolyline, finishPolygon, removeVertex, deleteItem])

  /* ═══════════════════════════════════════════════════════════
   *  ACTIONS
   * ═══════════════════════════════════════════════════════════ */

  async function deleteItem(id: number) {
    if (anyRecentlyMoved(id)) return
    try { await trackedDelete(id); onCountItemDeleted(id) }
    catch (err) { console.error('Delete failed:', err) }
    setSelectedItemIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      selectedItemIdsRef.current = next
      return next
    })
    setSelectedVertex(null)
  }

  async function deleteItems(ids: Set<number>) {
    if (anyRecentlyMoved(ids)) return
    const idsArr = Array.from(ids)
    try {
      await Promise.all(idsArr.map((id) => trackedDelete(id)))
      if (onCountItemsBatchDeleted) {
        onCountItemsBatchDeleted(idsArr)
      } else {
        idsArr.forEach((id) => onCountItemDeleted(id))
      }
    } catch (err) { console.error('Batch delete failed:', err) }
    const empty = new Set<number>()
    selectedItemIdsRef.current = empty
    setSelectedItemIds(empty)
    setSelectedVertex(null)
  }

  async function removeVertex(itemId: number, vIdx: number) {
    const item = countItems.find((i) => i.id === itemId)
    if (!item) return
    if (item.geometry_type === 'polyline' && item.geometry.length <= 2) return
    if (item.geometry_type === 'polygon' && item.geometry.length <= 4) return
    const g = [...item.geometry]
    g.splice(vIdx, 1)
    const updates: Partial<CountItem> = { geometry: g }
    if (isCalibrated) {
      if (item.geometry_type === 'polyline') updates.length_ft = calcLength(g)
      else if (item.geometry_type === 'polygon') {
        if (g.length >= 2) g[g.length - 1] = [...g[0]]
        updates.geometry = g
        updates.area_sqft = calcArea(g)
        updates.perimeter_ft = calcPerimeter(g)
      }
    } else {
      if (item.geometry_type === 'polyline') updates.length_ft = null
      else if (item.geometry_type === 'polygon') {
        if (g.length >= 2) g[g.length - 1] = [...g[0]]
        updates.geometry = g
        updates.area_sqft = null
        updates.perimeter_ft = null
      }
    }
    try { const u = await trackedUpdate(itemId, updates); onCountItemUpdated(u) }
    catch (err) { console.error('Remove vertex failed:', err) }
    setSelectedVertex(null)
  }

  async function finishPolyline(verts: number[][], isRedoRestore?: boolean) {
    if (verts.length >= 2 && activeCount) {
      try {
        const item = await trackedCreate({
          count_definition: activeCount.id, page: pageId,
          geometry_type: 'polyline', geometry: verts,
          length_ft: isCalibrated ? calcLength(verts) : null,
        })
        if (isRedoRestore && onCountItemRestoredByRedo) onCountItemRestoredByRedo(item)
        else onCountItemCreated(item)
      } catch (err) { console.error('Create polyline failed:', err) }
    }
    setDrawingState({ type: 'idle' })
  }

  async function finishPolygon(verts: number[][], isRedoRestore?: boolean) {
    if (verts.length >= 3 && activeCount) {
      const closed = [...verts, verts[0]]
      try {
        const item = await trackedCreate({
          count_definition: activeCount.id, page: pageId,
          geometry_type: 'polygon', geometry: closed,
          area_sqft: isCalibrated ? calcArea(closed) : null,
          perimeter_ft: isCalibrated ? calcPerimeter(closed) : null,
        })
        if (isRedoRestore && onCountItemRestoredByRedo) onCountItemRestoredByRedo(item)
        else onCountItemCreated(item)
      } catch (err) { console.error('Create polygon failed:', err) }
    }
    setDrawingState({ type: 'idle' })
  }

  /* ═══════════════════════════════════════════════════════════
   *  CLICK HANDLING
   * ═══════════════════════════════════════════════════════════ */

  function handleStageMouseDown(e: any) {
    if (e.evt.button !== 0) return
    if (panMode || spacePressed) return
    if (e.evt.ctrlKey || e.evt.metaKey) return

    // Capture selection on mousedown so multi-drag uses it. Only overwrite when we have
    // a non-empty selection (avoids clearing the "ids to move" after user clicks empty to deselect).
    const refNow = selectedItemIdsRef.current
    if (refNow.size > 0) {
      selectedItemIdsAtDragStartRef.current = new Set(refNow)
    }

    const pos = getCanvasPointer(e.evt)
    if (!pos) return

    // Note editor open: click on empty canvas dismisses it (don't create another note)
    if (showNoteEditor && e.target === e.target.getStage()) {
      onDismissNoteEditor?.()
      return
    }

    // Note mode: place a note on click
    if (noteMode) {
      const [nx, ny] = norm(pos.x, pos.y)
      onNoteCreated?.(nx, ny)
      return
    }

    // Click on empty canvas: notify parent (e.g. deselect note)
    if (e.target === e.target.getStage()) {
      onCanvasClick?.()
    }

    // Calibration mode
    if (isCalibrating) {
      if (!calPoint1) { setCalPoint1(pos) }
      else {
        const px = dist(calPoint1.x, calPoint1.y, pos.x, pos.y)
        onCalibrationComplete(px)
      }
      return
    }

    if (!activeCount && !eraseMode) {
      if (e.target === e.target.getStage()) {
        const empty = new Set<number>()
        selectedItemIdsRef.current = empty
        setSelectedItemIds(empty)
        setSelectedVertex(null)
      }
      return
    }

    // Double-click detection
    const now = Date.now()
    const last = lastClickPosRef.current
    const isDouble = (now - lastClickTimeRef.current < DBL_MS) &&
      last != null && Math.abs(pos.x - last.x) < DBL_PX && Math.abs(pos.y - last.y) < DBL_PX
    lastClickTimeRef.current = now
    lastClickPosRef.current = pos

    if (isDouble) {
      if (drawingState.type === 'drawing_polyline') {
        void finishPolyline(drawingState.vertices)
      } else if (drawingState.type === 'drawing_polygon') {
        void finishPolygon(drawingState.vertices)
      }
      return
    }

    // "Each" type: always place a fixed-size point marker (no drag-to-resize)
    if (activeCount && activeCount.count_type === 'each' && drawingState.type === 'idle') {
      const def = activeCount
      const [nx, ny] = norm(pos.x, pos.y)
      void (async () => {
        try {
          const item = await trackedCreate({
            count_definition: def.id, page: pageId,
            geometry_type: 'point', geometry: [[nx, ny]],
          })
          onCountItemCreated(item)
        } catch (err) { console.error('Create marker failed:', err) }
      })()
      return
    }

    // Rectangle polygon mode (R shortcut): 2-click rectangle for area_perimeter
    if (activeCount && rectPolygonMode && activeCount.count_type === 'area_perimeter') {
      const def = activeCount
      const [nx, ny] = norm(pos.x, pos.y)
      if (drawingState.type === 'idle') {
        setDrawingState({ type: 'drawing_rect_polygon', start: [nx, ny] })
        return
      } else if (drawingState.type === 'drawing_rect_polygon') {
        const [sx, sy] = drawingState.start
        const vertices: number[][] = [
          [sx, sy], [nx, sy], [nx, ny], [sx, ny], [sx, sy]
        ]
        void (async () => {
          try {
            const item = await trackedCreate({
              count_definition: def.id, page: pageId,
              geometry_type: 'polygon', geometry: vertices,
              area_sqft: isCalibrated ? calcArea(vertices) : null,
              perimeter_ft: isCalibrated ? calcPerimeter(vertices) : null,
            })
            onCountItemCreated(item)
          } catch (err) { console.error('Create rect polygon failed:', err) }
        })()
        setDrawingState({ type: 'idle' })
        return
      }
    }

    // Circle polygon mode (C shortcut): 2-click circle for area_perimeter
    if (activeCount && circlePolygonMode && activeCount.count_type === 'area_perimeter') {
      const def = activeCount
      const [nx, ny] = norm(pos.x, pos.y)
      if (drawingState.type === 'idle') {
        setDrawingState({ type: 'drawing_circle_polygon', center: [nx, ny] })
        return
      } else if (drawingState.type === 'drawing_circle_polygon') {
        const [cx, cy] = drawingState.center
        const [dx, dy] = denorm(cx, cy)
        const r = dist(dx, dy, pos.x, pos.y)
        const segments = 32
        const vertices: number[][] = []
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * 2 * Math.PI
          const [vx, vy] = denorm(cx, cy)
          const px = vx + r * Math.cos(angle)
          const py = vy + r * Math.sin(angle)
          vertices.push(norm(px, py))
        }
        vertices.push(vertices[0])
        void (async () => {
          try {
            const item = await trackedCreate({
              count_definition: def.id, page: pageId,
              geometry_type: 'polygon', geometry: vertices,
              area_sqft: isCalibrated ? calcArea(vertices) : null,
              perimeter_ft: isCalibrated ? calcPerimeter(vertices) : null,
            })
            onCountItemCreated(item)
          } catch (err) { console.error('Create circle polygon failed:', err) }
        })()
        setDrawingState({ type: 'idle' })
        return
      }
    }

    handleClick(pos)
  }

  async function handleStageMouseUp(e: any) {
    if (drawingState.type !== 'drawing_rect') return
    const pos = getCanvasPointer(e.evt)
    if (!pos || !activeCount) { setDrawingState({ type: 'idle' }); return }

    const [sx, sy] = drawingState.start
    const [ex, ey] = norm(pos.x, pos.y)
    const [dsx, dsy] = denorm(sx, sy)
    const minDrag = sz(8)

    if (dist(dsx, dsy, pos.x, pos.y) < minDrag) {
      // Quick click: place a point marker (small, consistent size)
      try {
        const item = await trackedCreate({
          count_definition: activeCount.id, page: pageId,
          geometry_type: 'point', geometry: [[sx, sy]],
        })
        onCountItemCreated(item)
      } catch (err) { console.error('Create marker failed:', err) }
    } else {
      const shapeMap: Record<string, CountItem['geometry_type']> = { circle: 'circle', triangle: 'triangle', square: 'rect' }
      const geoType: CountItem['geometry_type'] = shapeMap[activeCount.shape || 'square'] || 'rect'
      try {
        const item = await trackedCreate({
          count_definition: activeCount.id, page: pageId,
          geometry_type: geoType, geometry: [[sx, sy], [ex, ey]],
        })
        onCountItemCreated(item)
      } catch (err) { console.error('Create shape failed:', err) }
    }
    setDrawingState({ type: 'idle' })
  }

  async function handleClick(pos: { x: number; y: number }) {
    if (!activeCount) return
    const [nx, ny] = norm(pos.x, pos.y)
    const ct = activeCount.count_type

    // Clear redo stack on new vertex
    vertexRedoStackRef.current = []

    if (ct === 'linear_feet') {
      if (drawingState.type === 'drawing_polyline')
        setDrawingState({ type: 'drawing_polyline', vertices: [...drawingState.vertices, [nx, ny]] })
      else
        setDrawingState({ type: 'drawing_polyline', vertices: [[nx, ny]] })
    } else if (ct === 'area_perimeter') {
      if (drawingState.type === 'drawing_polygon') {
        // Snap to close
        if (drawingState.vertices.length >= 3) {
          const [fx, fy] = denorm(drawingState.vertices[0][0], drawingState.vertices[0][1])
          if (dist(pos.x, pos.y, fx, fy) < sz(S.snap)) {
            void finishPolygon(drawingState.vertices)
            return
          }
        }
        setDrawingState({ type: 'drawing_polygon', vertices: [...drawingState.vertices, [nx, ny]] })
      } else {
        setDrawingState({ type: 'drawing_polygon', vertices: [[nx, ny]] })
      }
    }
  }

  function handleMouseMove(e: any) {
    const pos = getCanvasPointer(e.evt)
    if (pos) setCursorPos(pos)
  }

  function handleVertexDragEnd(itemId: number, vIdx: number, newPos: { x: number; y: number }) {
    setIsDragging(false)
    const item = countItemsRef.current.find((i) => i.id === itemId)
    if (!item) return
    const [nx, ny] = norm(newPos.x, newPos.y)
    const g = item.geometry.map(c => [...c])
    g[vIdx] = [nx, ny]
    if (item.geometry_type === 'polygon') {
      if (vIdx === 0 && g.length > 1) g[g.length - 1] = [nx, ny]
      if (vIdx === g.length - 1 && g.length > 1) g[0] = [nx, ny]
    }
    const updates: Partial<CountItem> = { geometry: g }
    if (isCalibrated) {
      if (item.geometry_type === 'polyline') updates.length_ft = calcLength(g)
      else if (item.geometry_type === 'polygon') {
        updates.area_sqft = calcArea(g)
        updates.perimeter_ft = calcPerimeter(g)
      }
    } else {
      if (item.geometry_type === 'polyline') updates.length_ft = null
      else if (item.geometry_type === 'polygon') {
        updates.area_sqft = null
        updates.perimeter_ft = null
      }
    }
    // Optimistic local update first, then persist to server
    const optimistic: CountItem = { ...item, ...updates }
    onCountItemUpdated(optimistic)
    trackedUpdate(itemId, updates).catch((err) => console.error('Vertex drag failed:', err))
  }

  const dragGuardActive = () => {
    if (dragJustEndedRef.current || completingDragRef.current) return true
    return Date.now() - lastDragActivityTimeRef.current < DRAG_DELETE_BLOCK_MS
  }

  /** True if any of the given ids were recently moved (block delete). */
  const anyRecentlyMoved = (ids: Set<number> | number) => {
    const set = typeof ids === 'number' ? new Set([ids]) : ids
    for (const id of set) if (recentlyMovedIdsRef.current.has(id)) return true
    return false
  }

  function handleShapeClick(e: any, itemId: number) {
    e.cancelBubble = true
    if (dragGuardActive() && (cPressed || eraseMode)) return
    if (anyRecentlyMoved(itemId)) return
    if (eraseMode) {
      if (dragGuardActive()) return
      const item = countItems.find((i) => i.id === itemId)
      if (!item) return
      const uniqueVertCount = item.geometry_type === 'polygon' ? item.geometry.length - 1 : 0
      const isRect = item.geometry_type === 'polygon' && (uniqueVertCount >= 3 && uniqueVertCount <= 6)
      const isCircle = item.geometry_type === 'circle' || (item.geometry_type === 'polygon' && uniqueVertCount >= 16)
      if (eraseFilter === 'all' || (eraseFilter === 'rect' && isRect) || (eraseFilter === 'circle' && isCircle)) {
        void deleteItem(itemId)
      }
      return
    }
    if (cPressed && !dragGuardActive()) void deleteItem(itemId)
    else {
      const evt = e.evt || e
      if (evt?.shiftKey) {
        const next = new Set(selectedItemIds)
        if (next.has(itemId)) next.delete(itemId)
        else next.add(itemId)
        selectedItemIdsRef.current = next
        setSelectedItemIds(next)
      } else {
        if (selectedItemIds.has(itemId) && selectedItemIds.size > 1) {
          setSelectedVertex(null)
          return
        }
        const next = new Set([itemId])
        selectedItemIdsRef.current = next
        setSelectedItemIds(next)
      }
      setSelectedVertex(null)
    }
  }

  /* ═══════════════════════════════════════════════════════════
   *  CURSOR
   * ═══════════════════════════════════════════════════════════ */

  const cursorStyle =
    panMode || spacePressed ? 'grab'
    : eraseMode ? 'crosshair'
    : noteMode ? 'crosshair'
    : isCalibrating ? 'crosshair'
    : isDrawingMode ? (activeCount!.count_type === 'each' ? 'crosshair' : 'none')
    : 'default'

  /* ═══════════════════════════════════════════════════════════
   *  DRAGGING ENTIRE ITEMS
   * ═══════════════════════════════════════════════════════════ */

  /** Base position of an item's drag origin (for point: center; for rect/circle/triangle: center; for line/polygon: 0,0). */
  function getItemBasePosition(item: CountItem): { x: number; y: number } {
    if (item.geometry_type === 'point') {
      const [x, y] = denorm(item.geometry[0][0], item.geometry[0][1])
      return { x, y }
    }
    if (item.geometry_type === 'polyline' || item.geometry_type === 'polygon') {
      return { x: 0, y: 0 }
    }
    if (item.geometry.length >= 2) {
      const [x1, y1] = denorm(item.geometry[0][0], item.geometry[0][1])
      const [x2, y2] = denorm(item.geometry[1][0], item.geometry[1][1])
      return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
    }
    const [x, y] = denorm(item.geometry[0][0], item.geometry[0][1])
    return { x, y }
  }

  function handleItemDragMove(e: any) {
    if (selectedItemIdsAtDragStartRef.current.size <= 1) return
    const node = e.target
    if (!node) return
    const startAbs = multiDragStartAbsoluteRef.current
    if (startAbs) {
      const abs = node.getAbsolutePosition?.() ?? node.position?.() ?? { x: 0, y: 0 }
      const dx = (abs.x ?? 0) - startAbs.x
      const dy = (abs.y ?? 0) - startAbs.y
      multiDragOffsetRef.current = { dx, dy }
      flushSync(() => setMultiDragOffset({ dx, dy }))
      return
    }
    const itemId = draggedItemIdRef.current
    if (itemId == null) return
    const item = countItemsRef.current.find((i) => i.id === itemId)
    if (!item) return
    const base = getItemBasePosition(item)
    const pos = node.position ? node.position() : { x: 0, y: 0 }
    const dx = (pos.x ?? 0) - base.x
    const dy = (pos.y ?? 0) - base.y
    multiDragOffsetRef.current = { dx, dy }
    flushSync(() => setMultiDragOffset({ dx, dy }))
  }

  function handleItemDragStart(itemId: number, e?: any) {
    setIsDragging(true)
    completingDragRef.current = true
    lastDragActivityTimeRef.current = Date.now()
    const fromMouseDown = selectedItemIdsAtDragStartRef.current
    const fromRef = selectedItemIdsRef.current
    const fromState = selectedItemIds
    const candidates = [fromMouseDown, fromRef, fromState]
    const best = candidates.reduce((a, b) => (a.size >= b.size ? a : b))
    const idsToMove = best.has(itemId) ? new Set(best) : new Set([itemId])
    selectedItemIdsAtDragStartRef.current = idsToMove
    if (idsToMove.size > 1) {
      draggedItemIdRef.current = itemId
      multiDragStartAbsoluteRef.current = e?.target?.getAbsolutePosition?.() ?? null
      multiDragOffsetRef.current = { dx: 0, dy: 0 }
      const bases = new Map<number, { x: number; y: number }>()
      idsToMove.forEach((id) => {
        const it = countItemsRef.current.find((i) => i.id === id)
        if (it) bases.set(id, getItemBasePosition(it))
      })
      multiDragBasesRef.current = bases
      setMultiDragOffset({ dx: 0, dy: 0 })
      setSelectedVertex(null)
      return
    }
    singleDragStartPosRef.current = e?.target?.getAbsolutePosition?.() ?? null
    setSelectedItemIds((prev) => {
      if (prev.has(itemId)) return prev
      const next = new Set([itemId])
      selectedItemIdsRef.current = next
      return next
    })
    setSelectedVertex(null)
  }

  async function handleItemDragEnd(itemId: number, e: any) {
    completingDragRef.current = true
    lastDragActivityTimeRef.current = Date.now()
    multiDragPointerStartRef.current = null
    if (multiDragRafRef.current != null) {
      cancelAnimationFrame(multiDragRafRef.current)
      multiDragRafRef.current = null
    }
    draggedItemIdRef.current = null
    dragJustEndedRef.current = true
    const clearDragGuards = () => {
      dragJustEndedRef.current = false
      completingDragRef.current = false
    }
    setTimeout(clearDragGuards, DRAG_GUARD_MS)
    // e.target is the dragged node (the Group) in Konva drag events
    const node = e.target
    if (!node) return
    const pos = node.position ? node.position() : { x: 0, y: 0 }
    let idsToMove = selectedItemIdsAtDragStartRef.current.size > 0
      ? selectedItemIdsAtDragStartRef.current
      : (selectedItemIds.has(itemId) ? selectedItemIds : new Set([itemId]))
    if (idsToMove.size <= 1 && selectedItemIds.size > 1 && selectedItemIds.has(itemId)) {
      idsToMove = new Set(selectedItemIds)
    }
    // Delta: use absolute position when available so all types (rect, polygon, etc.) use same coordinate system
    let dx: number
    let dy: number
    if (idsToMove.size > 1 && multiDragStartAbsoluteRef.current) {
      const abs = node.getAbsolutePosition?.() ?? { x: pos.x ?? 0, y: pos.y ?? 0 }
      dx = (abs.x ?? 0) - multiDragStartAbsoluteRef.current.x
      dy = (abs.y ?? 0) - multiDragStartAbsoluteRef.current.y
    } else if (idsToMove.size === 1 && singleDragStartPosRef.current) {
      const abs = node.getAbsolutePosition?.() ?? { x: pos.x ?? 0, y: pos.y ?? 0 }
      dx = (abs.x ?? 0) - singleDragStartPosRef.current.x
      dy = (abs.y ?? 0) - singleDragStartPosRef.current.y
    } else {
      const draggedItem = countItemsRef.current.find((i) => i.id === itemId)
      const base = draggedItem ? getItemBasePosition(draggedItem) : { x: 0, y: 0 }
      dx = (pos.x ?? 0) - base.x
      dy = (pos.y ?? 0) - base.y
    }
    // Clear visual offset only after state has committed (double rAF so parent re-render is done)
    const clearOffsetNextFrame = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          multiDragOffsetRef.current = null
          setMultiDragOffset(null)
        })
      })
    }
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      singleDragStartPosRef.current = null
      multiDragBasesRef.current = new Map()
      multiDragStartAbsoluteRef.current = null
      multiDragOffsetRef.current = null
      forceGroupZeroIdRef.current = null
      setMultiDragOffset(null)
      selectedItemIdsAtDragStartRef.current = new Set()
      setIsDragging(false)
      return
    }
    const markMovedAndClearBases = () => {
      idsToMove.forEach((id) => recentlyMovedIdsRef.current.add(id))
      setTimeout(() => {
        recentlyMovedIdsRef.current.clear()
      }, RECENTLY_MOVED_BLOCK_MS)
      singleDragStartPosRef.current = null
      multiDragBasesRef.current = new Map()
      multiDragStartAbsoluteRef.current = null
      multiDragOffsetRef.current = null
      forceGroupZeroIdRef.current = null
    }
    const draggedIsLineOrPoly = (() => {
      const it = countItemsRef.current.find((i) => i.id === itemId)
      return it && (it.geometry_type === 'polyline' || it.geometry_type === 'polygon')
    })()
    if (draggedIsLineOrPoly) forceGroupZeroIdRef.current = itemId
    if (idsToMove.size === 1) {
      // Reset Konva node to origin BEFORE updating geometry so there's no flash
      try { node.position({ x: 0, y: 0 }) } catch (_) {}

      // Optimistically update geometry in local state immediately (no waiting for server)
      const item = countItemsRef.current.find((i) => i.id === itemId)
      if (item) {
        const movedGeom = item.geometry.map(([nx, ny]) => {
          const [x, y] = denorm(nx, ny)
          return norm(x + dx, y + dy)
        })
        if (item.geometry_type === 'polygon' && movedGeom.length >= 2) {
          movedGeom[movedGeom.length - 1] = [...movedGeom[0]]
        }
        const optimistic: CountItem = {
          ...item,
          geometry: movedGeom.map(c => [...c]),
          ...(isCalibrated && item.geometry_type === 'polyline' ? { length_ft: calcLength(movedGeom) } : {}),
          ...(isCalibrated && item.geometry_type === 'polygon' ? { area_sqft: calcArea(movedGeom), perimeter_ft: calcPerimeter(movedGeom) } : {}),
        }
        onCountItemUpdated(optimistic)

        // Persist to server in background (fire-and-forget with error handling)
        const updates: Partial<CountItem> = { geometry: movedGeom }
        if (isCalibrated) {
          if (item.geometry_type === 'polyline') updates.length_ft = calcLength(movedGeom)
          else if (item.geometry_type === 'polygon') {
            updates.area_sqft = calcArea(movedGeom)
            updates.perimeter_ft = calcPerimeter(movedGeom)
          }
        }
        trackedUpdate(itemId, updates).catch((err) => console.error('Failed to persist drag:', err))
      }
      markMovedAndClearBases()
      clearOffsetNextFrame()
    } else {
      try {
        const batchUpdates: { id: number; item: CountItem }[] = []
        for (const id of idsToMove) {
          const item = countItemsRef.current.find((i) => i.id === id)
          if (!item) continue
          const newGeom = item.geometry.map(([nx, ny]) => {
            const [x, y] = denorm(nx, ny)
            return norm(x + dx, y + dy)
          })
          const updates: Partial<CountItem> = { geometry: newGeom }
          if (isCalibrated) {
            if (item.geometry_type === 'polyline') updates.length_ft = calcLength(newGeom)
            else if (item.geometry_type === 'polygon') {
              updates.area_sqft = calcArea(newGeom)
              updates.perimeter_ft = calcPerimeter(newGeom)
            }
          }
          const u = await trackedUpdate(id, updates)
          batchUpdates.push({ id, item: { ...u, geometry: newGeom.map((c) => [...c]) } })
        }
        if (onCountItemsBatchMoved && batchUpdates.length > 0) {
          onCountItemsBatchMoved(batchUpdates)
        } else {
          batchUpdates.forEach(({ item }) => onCountItemUpdated(item))
        }
        markMovedAndClearBases()
        clearOffsetNextFrame()
      } catch (err) {
        console.error('Failed to save item positions:', err)
        multiDragBasesRef.current = new Map()
        multiDragStartAbsoluteRef.current = null
        multiDragOffsetRef.current = null
        forceGroupZeroIdRef.current = null
        setMultiDragOffset(null)
      }
    }
    selectedItemIdsAtDragStartRef.current = new Set()
    forceGroupZeroIdRef.current = null
    setIsDragging(false)
  }

  /* ═══════════════════════════════════════════════════════════
   *  RENDER: Reusable measurement tag
   *
   *  Draws a pill-shaped label with semi-transparent bg.
   *  All sizes go through sz() so labels stay readable at
   *  every zoom level.
   * ═══════════════════════════════════════════════════════════ */

  function renderTag(
    text: string,
    cx: number,
    cy: number,
    bg = 'rgba(0,0,0,0.72)',
    fg = '#ffffff',
    fontSize = S.font,
    offsetY = 0,
    stableKey?: string,
  ) {
    // Use sz() so labels stay a consistent size on screen,
    // even when you zoom the plan way in or out.
    const fs = sz(fontSize)
    const padX = sz(S.pad + 2)
    const padY = sz(S.pad)
    const charW = fs * 0.62
    const tw = text.length * charW
    const bw = tw + padX * 2
    const bh = fs + padY * 2
    const dy = sz(offsetY)
    return (
      <Group
        x={cx}
        y={cy + dy}
        rotation={-rotation}
        listening={false}
        key={stableKey ?? `tag-${text}-${cx.toFixed(0)}-${cy.toFixed(0)}`}
      >
        <Rect
          x={-bw / 2}
          y={-bh / 2}
          width={bw}
          height={bh}
          fill={bg}
          cornerRadius={4}
        />
        <Text
          x={-tw / 2}
          y={-fs / 2}
          text={text}
          fontSize={fs}
          fill={fg}
          fontStyle="bold"
          fontFamily="Inter, system-ui, -apple-system, sans-serif"
        />
      </Group>
    )
  }

  /** Segment-length label at the midpoint of two canvas points. */
  function renderSegLabel(x1: number, y1: number, x2: number, y2: number, color: string) {
    const px = dist(x1, y1, x2, y2)
    const ft = px * fpp
    if (ft < 0.1) return null
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    return renderTag(formatFt(ft), mx, my, color + 'CC', '#fff', S.fontSm, -14)
  }

  /* ═══════════════════════════════════════════════════════════
   *  RENDER: Markers (Each)
   *
   *  Each markers scale with the image (zoom in → marker grows,
   *  zoom out → marker shrinks, staying over the same spot).
   *  Size is a fraction of the image so low-res and high-res
   *  pages show the same visual marker size at the same fit zoom.
   * ═══════════════════════════════════════════════════════════ */

  const markerSize = Math.min(width, height) * 0.04
  const markerStroke = Math.max(1, markerSize * 0.04)

  function MarkerImageScaled({ src, size, isSel, stroke, common }: { src: string; size: number; isSel: boolean; stroke: string; common: object }) {
    const [img, setImg] = useState<HTMLImageElement | null>(null)
    useEffect(() => {
      if (!src) return
      const i = new window.Image();
      (i as any).crossOrigin = 'anonymous'
      i.onload = () => setImg(i)
      i.onerror = () => setImg(null)
      i.src = src
      return () => { i.src = '' }
    }, [src])
    if (!img) {
      return <Rect x={-size / 2} y={-size / 2} width={size} height={size} fill="#eee" stroke="#999" strokeWidth={1} {...common} />
    }
    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight)
    const w = img.naturalWidth * scale
    const h = img.naturalHeight * scale
    return (
      <>
        <Image image={img} x={-w / 2} y={-h / 2} width={w} height={h} {...common} />
        {isSel && <Rect x={-size / 2} y={-size / 2} width={size} height={size} stroke={stroke} strokeWidth={markerStroke} listening={false} />}
      </>
    )
  }

  function renderMarker(item: CountItem, def: CountDefinition, dragOffset?: { dx: number; dy: number } | null, effectiveBase?: { x: number; y: number } | null) {
    const [rawX, rawY] = denorm(item.geometry[0][0], item.geometry[0][1])
    const ox = dragOffset?.dx ?? 0
    const oy = dragOffset?.dy ?? 0
    const gx = (effectiveBase?.x ?? rawX) + ox
    const gy = (effectiveBase?.y ?? rawY) + oy
    const isSel = selectedItemIds.has(item.id)
    const size = markerSize
    const sw = markerStroke
    const hit = S.hit
    const click = (e: any) => handleShapeClick(e, item.id)
    const rotDeg = item.rotation_deg ?? 0

    const common = { onClick: click, hitStrokeWidth: hit }
    const fill = def.color + '30'
    const stroke = isSel ? SEL_COLOR : def.color
    const imageUrl = (def.shape === 'image' && (def.shape_image_url?.trim() ?? ''))
      ? (def.shape_image_url!.startsWith('http') ? def.shape_image_url! : `${MEDIA_BASE}/${def.shape_image_url}`)
      : null

    const marker =
      imageUrl ? (
        <MarkerImageScaled src={imageUrl} size={size} isSel={isSel} stroke={stroke} common={common} />
      ) : def.shape === 'circle' ? (
        <Circle x={0} y={0} radius={size / 2} fill={fill} stroke={stroke} strokeWidth={sw} {...common} />
      ) : def.shape === 'triangle' ? (
        <RegularPolygon
          x={0}
          y={0}
          sides={3}
          radius={size / 2 + 1}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          {...common}
        />
      ) : (
        <Rect
          x={-size / 2}
          y={-size / 2}
          width={size}
          height={size}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          cornerRadius={2}
          {...common}
        />
      )

    const markerHandleOffset = size * 0.6
    const rotHandle = isSel ? (
      <Circle
        x={0}
        y={-size / 2 - markerHandleOffset}
        radius={size * 0.16}
        fill="#fff"
        stroke={SEL_COLOR}
        strokeWidth={3}
        draggable
        onDragStart={(e) => { e.cancelBubble = true }}
        onDragMove={(e) => {
          e.cancelBubble = true
          const stage = stageRef.current
          if (!stage) return
          const pointer = stage.getPointerPosition()
          if (!pointer) return
          const angle = Math.atan2(pointer.x - gx, -(pointer.y - gy)) * (180 / Math.PI)
          const updates: Partial<CountItem> = { rotation_deg: Math.round(angle) }
          void trackedUpdate(item.id, updates).then((u) => onCountItemUpdated(u)).catch(() => {})
          e.target.x(0)
          e.target.y(-size / 2 - markerHandleOffset)
        }}
        onDragEnd={(e) => { e.cancelBubble = true }}
        onMouseEnter={(e) => { e.target.getStage()!.container().style.cursor = 'grab' }}
        onMouseLeave={(e) => { e.target.getStage()!.container().style.cursor = '' }}
      />
    ) : null

    return (
      <Group
        key={item.id}
        x={gx}
        y={gy}
        rotation={rotDeg}
        draggable
        dragDistance={DRAG_DISTANCE_PX}
        onMouseDown={() => { const r = selectedItemIdsRef.current; if (r.size > 0) selectedItemIdsAtDragStartRef.current = new Set(r) }}
        onDragStart={(ev) => handleItemDragStart(item.id, ev)}
        onDragMove={handleItemDragMove}
        onDragEnd={(e) => handleItemDragEnd(item.id, e)}
      >
        {marker}
        {rotHandle}
      </Group>
    )
  }

  /* ═══════════════════════════════════════════════════════════
   *  RENDER: Rectangle (drag-drawn "Each" items)
   * ═══════════════════════════════════════════════════════════ */

  function renderRect(item: CountItem, def: CountDefinition, dragOffset?: { dx: number; dy: number } | null, effectiveBase?: { x: number; y: number } | null) {
    if (item.geometry.length < 2) return null
    const [x1, y1] = denorm(item.geometry[0][0], item.geometry[0][1])
    const [x2, y2] = denorm(item.geometry[1][0], item.geometry[1][1])
    const isSel = selectedItemIds.has(item.id)
    const sw = sz(isSel ? 20 : 16)

    const rx = Math.min(x1, x2)
    const ry = Math.min(y1, y2)
    const rw = Math.abs(x2 - x1)
    const rh = Math.abs(y2 - y1)
    const rotDeg = item.rotation_deg ?? 0
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
    const ox = dragOffset?.dx ?? 0
    const oy = dragOffset?.dy ?? 0
    const base = effectiveBase ?? { x: cx, y: cy }

    return (
      <Group
        key={item.id}
        rotation={rotDeg}
        x={base.x + ox}
        y={base.y + oy}
        offsetX={cx}
        offsetY={cy}
        draggable
        dragDistance={DRAG_DISTANCE_PX}
        onMouseDown={() => { const r = selectedItemIdsRef.current; if (r.size > 0) selectedItemIdsAtDragStartRef.current = new Set(r) }}
        onDragStart={(ev) => handleItemDragStart(item.id, ev)}
        onDragMove={handleItemDragMove}
        onDragEnd={(e) => handleItemDragEnd(item.id, e)}
      >
        <Rect
          x={rx} y={ry} width={rw} height={rh}
          fill={def.color + '30'}
          stroke={isSel ? SEL_COLOR : def.color} strokeWidth={sw}
          cornerRadius={sz(2)}
          onClick={(e: any) => handleShapeClick(e, item.id)}
          hitStrokeWidth={sz(S.hit)}
        />
        {isSel && renderRotationHandle(item, cx, cy, ry, rotDeg)}
      </Group>
    )
  }

  /* ═══════════════════════════════════════════════════════════
   *  RENDER: Circle / Ellipse (drag-drawn "Each" items with circle shape)
   * ═══════════════════════════════════════════════════════════ */

  function renderCircleShape(item: CountItem, def: CountDefinition, dragOffset?: { dx: number; dy: number } | null, effectiveBase?: { x: number; y: number } | null) {
    if (item.geometry.length < 2) return null
    const [x1, y1] = denorm(item.geometry[0][0], item.geometry[0][1])
    const [x2, y2] = denorm(item.geometry[1][0], item.geometry[1][1])
    const isSel = selectedItemIds.has(item.id)
    const sw = sz(isSel ? 20 : 16)

    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2
    const rx = Math.abs(x2 - x1) / 2
    const ry = Math.abs(y2 - y1) / 2
    const rotDeg = item.rotation_deg ?? 0
    const topY = cy - Math.max(rx, ry)
    const ox = dragOffset?.dx ?? 0
    const oy = dragOffset?.dy ?? 0
    const base = effectiveBase ?? { x: cx, y: cy }

    return (
      <Group
        key={item.id}
        rotation={rotDeg}
        x={base.x + ox}
        y={base.y + oy}
        offsetX={cx}
        offsetY={cy}
        draggable
        dragDistance={DRAG_DISTANCE_PX}
        onMouseDown={() => { const r = selectedItemIdsRef.current; if (r.size > 0) selectedItemIdsAtDragStartRef.current = new Set(r) }}
        onDragStart={(ev) => handleItemDragStart(item.id, ev)}
        onDragMove={handleItemDragMove}
        onDragEnd={(e) => handleItemDragEnd(item.id, e)}
      >
        <Ellipse
          x={cx} y={cy} radiusX={rx} radiusY={ry}
          fill={def.color + '30'}
          stroke={isSel ? SEL_COLOR : def.color} strokeWidth={sw}
          onClick={(e: any) => handleShapeClick(e, item.id)}
          hitStrokeWidth={sz(S.hit)}
        />
        {isSel && renderRotationHandle(item, cx, cy, topY, rotDeg)}
      </Group>
    )
  }

  /* ═══════════════════════════════════════════════════════════
   *  RENDER: Rotation handle for placed shapes
   * ═══════════════════════════════════════════════════════════ */

  function renderRotationHandle(item: CountItem, cx: number, cy: number, topY: number, _rotDeg: number) {
    // Use fixed canvas-space sizes so the handle scales together with the shape.
    const handleOffset = 40
    const handleR = 14
    const lineW = 3

    return (
      <Group>
        <Line points={[cx, topY, cx, topY - handleOffset]} stroke={SEL_COLOR} strokeWidth={lineW} />
        <Circle x={cx} y={topY - handleOffset} radius={handleR}
          fill="#fff" stroke={SEL_COLOR} strokeWidth={3}
          draggable
          onDragStart={(e) => { e.cancelBubble = true }}
          onDragMove={(e) => {
            e.cancelBubble = true
            const stage = stageRef.current
            if (!stage) return
            const pointer = stage.getPointerPosition()
            if (!pointer) return
            const angle = Math.atan2(pointer.x - cx, -(pointer.y - cy)) * (180 / Math.PI)
            const updates: Partial<CountItem> = { rotation_deg: Math.round(angle) }
            void trackedUpdate(item.id, updates).then((u) => onCountItemUpdated(u)).catch(() => {})
            e.target.x(cx)
            e.target.y(topY - handleOffset)
          }}
          onDragEnd={(e) => { e.cancelBubble = true }}
          onMouseEnter={(e) => { e.target.getStage()!.container().style.cursor = 'grab' }}
          onMouseLeave={(e) => { e.target.getStage()!.container().style.cursor = '' }}
        />
      </Group>
    )
  }

  /* ═══════════════════════════════════════════════════════════
   *  RENDER: Triangle (drag-drawn "Each" items with triangle shape)
   * ═══════════════════════════════════════════════════════════ */

  function renderTriangleShape(item: CountItem, def: CountDefinition, dragOffset?: { dx: number; dy: number } | null, effectiveBase?: { x: number; y: number } | null) {
    if (item.geometry.length < 2) return null
    const [x1, y1] = denorm(item.geometry[0][0], item.geometry[0][1])
    const [x2, y2] = denorm(item.geometry[1][0], item.geometry[1][1])
    const isSel = selectedItemIds.has(item.id)
    const sw = sz(isSel ? 20 : 16)
    const midX = (x1 + x2) / 2
    const topY = Math.min(y1, y2)
    const triPts = [midX, topY, Math.max(x1, x2), Math.max(y1, y2), Math.min(x1, x2), Math.max(y1, y2)]

    const rotDeg = item.rotation_deg ?? 0
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
    const ox = dragOffset?.dx ?? 0
    const oy = dragOffset?.dy ?? 0
    const base = effectiveBase ?? { x: cx, y: cy }

    return (
      <Group
        key={item.id}
        rotation={rotDeg}
        x={base.x + ox}
        y={base.y + oy}
        offsetX={cx}
        offsetY={cy}
        draggable
        dragDistance={DRAG_DISTANCE_PX}
        onMouseDown={() => { const r = selectedItemIdsRef.current; if (r.size > 0) selectedItemIdsAtDragStartRef.current = new Set(r) }}
        onDragStart={(ev) => handleItemDragStart(item.id, ev)}
        onDragMove={handleItemDragMove}
        onDragEnd={(e) => handleItemDragEnd(item.id, e)}
      >
        <Line points={triPts} closed
          fill={def.color + '30'}
          stroke={isSel ? SEL_COLOR : def.color} strokeWidth={sw}
          onClick={(e: any) => handleShapeClick(e, item.id)}
          hitStrokeWidth={sz(S.hit)}
        />
        {isSel && renderRotationHandle(item, cx, cy, topY, rotDeg)}
      </Group>
    )
  }

  /* ═══════════════════════════════════════════════════════════
   *  RENDER: Polyline (Linear Feet)
   * ═══════════════════════════════════════════════════════════ */

  function renderPolyline(item: CountItem, def: CountDefinition, dragOffset?: { dx: number; dy: number } | null, _effectiveBase?: { x: number; y: number } | null) {
    const ox = dragOffset?.dx ?? 0
    const oy = dragOffset?.dy ?? 0
    const pts: number[] = []
    const cVerts: [number, number][] = []
    item.geometry.forEach(([nx, ny]) => {
      const [x, y] = denorm(nx, ny)
      pts.push(x + ox, y + oy)
      cVerts.push([x + ox, y + oy])
    })
    const isSel = selectedItemIds.has(item.id)
    const lw = sz(isSel ? S.lineW + 1 : S.lineW)
    const vr = sz(S.vert)
    const vrH = sz(S.vertHover)
    const vs = sz(2)

    const totalFt = item.length_ft ?? calcLength(item.geometry)
    const [startX, startY] = cVerts.length > 0 ? cVerts[0] : [0, 0]
    const totalLabel = isCalibrated ? `Total: ${formatFt(totalFt)}` : 'Total: —'

    const forceZero = forceGroupZeroIdRef.current === item.id
    return (
      <Group
        key={item.id}
        x={forceZero ? 0 : (isDragging ? undefined : 0)}
        y={forceZero ? 0 : (isDragging ? undefined : 0)}
        draggable
        dragDistance={DRAG_DISTANCE_PX}
        onMouseDown={() => { const r = selectedItemIdsRef.current; if (r.size > 0) selectedItemIdsAtDragStartRef.current = new Set(r) }}
        onDragStart={(ev) => handleItemDragStart(item.id, ev)}
        onDragMove={handleItemDragMove}
        onDragEnd={(e) => handleItemDragEnd(item.id, e)}
      >
        {/* Hit area */}
        <Line points={pts} stroke="transparent" strokeWidth={sz(S.hit)}
          lineCap="round" lineJoin="round" onClick={(e: any) => handleShapeClick(e, item.id)} onDblClick={(e: any) => handleLineDblClick(item.id, e)} />
        {/* Visible line */}
        <Line points={pts} stroke={isSel ? SEL_COLOR : def.color} strokeWidth={lw}
          lineCap="round" lineJoin="round" onClick={(e: any) => handleShapeClick(e, item.id)} onDblClick={(e: any) => handleLineDblClick(item.id, e)} />

        {/* Per-segment length labels (only when selected and calibrated) */}
        {isCalibrated && isSel && cVerts.length >= 2 && cVerts.map(([x, y], i) => {
          if (i === 0) return null
          return <React.Fragment key={`seg-${i}`}>
            {renderSegLabel(cVerts[i - 1][0], cVerts[i - 1][1], x, y, def.color)}
          </React.Fragment>
        })}

        {/* Total length label — dark bg, always visible */}
        {renderTag(totalLabel, startX, startY, 'rgba(0,0,0,0.72)', '#ffffff', S.font, -22)}

        {/* Vertex handles */}
        {item.geometry.map(([nx, ny], idx) => {
          const [vx, vy] = denorm(nx, ny)
          const hov = hoveredVertex?.itemId === item.id && hoveredVertex?.idx === idx
          const sel = selectedVertex?.itemId === item.id && selectedVertex?.idx === idx
          return (
            <Circle key={`v${idx}`} x={vx + ox} y={vy + oy}
              radius={hov || sel ? vrH : vr}
              fill={hov ? 'rgba(0,0,0,0.7)' : sel ? '#fff' : 'rgba(255,255,255,0.8)'}
              stroke={def.color} strokeWidth={vs}
              draggable
              onMouseDown={(e) => { e.cancelBubble = true }}
              onDragStart={(e) => { e.cancelBubble = true; setIsDragging(true) }}
              onDragEnd={(e) => { e.cancelBubble = true; handleVertexDragEnd(item.id, idx, { x: e.target.x(), y: e.target.y() }) }}
              onClick={(e) => {
                e.cancelBubble = true
                const next = new Set([item.id])
                selectedItemIdsRef.current = next
                setSelectedItemIds(next)
                setSelectedVertex({ itemId: item.id, idx })
              }}
              onMouseEnter={(e) => { setHoveredVertex({ itemId: item.id, idx }); e.target.getStage()!.container().style.cursor = 'move' }}
              onMouseLeave={(e) => { setHoveredVertex(null); e.target.getStage()!.container().style.cursor = '' }}
            />
          )
        })}
      </Group>
    )
  }

  /* ═══════════════════════════════════════════════════════════
   *  RENDER: Polygon (Area & Perimeter)
   * ═══════════════════════════════════════════════════════════ */

  function renderPolygon(item: CountItem, def: CountDefinition, dragOffset?: { dx: number; dy: number } | null, _effectiveBase?: { x: number; y: number } | null) {
    const ox = dragOffset?.dx ?? 0
    const oy = dragOffset?.dy ?? 0
    const uniqueVerts = item.geometry.slice(0, -1)
    const pts: number[] = []
    const cVerts: [number, number][] = []
    uniqueVerts.forEach(([nx, ny]) => {
      const [x, y] = denorm(nx, ny)
      pts.push(x + ox, y + oy)
      cVerts.push([x + ox, y + oy])
    })
    const isSel = selectedItemIds.has(item.id)
    const pw = sz(isSel ? S.polyW + 1 : S.polyW)
    const vr = sz(S.vert)
    const vrH = sz(S.vertHover)
    const vs = sz(2)

    const areaVal = item.area_sqft ?? calcArea(item.geometry)
    const perimVal = item.perimeter_ft ?? calcPerimeter(item.geometry)
    const [cx, cy] = centroid(item.geometry)
    const isCirclePolygon = uniqueVerts.length >= 16
    const labelCx = cx + ox
    const labelCy = cy + oy
    // Single centered label like polyline's "Total:" — same style (dark pill, white text)
    const polygonLabel = isCalibrated ? `${formatSqft(areaVal)}  ·  ${formatFt(perimVal)}` : '—'
    const forceZero = forceGroupZeroIdRef.current === item.id

    return (
      <Group
        key={item.id}
        x={forceZero ? 0 : (isDragging ? undefined : 0)}
        y={forceZero ? 0 : (isDragging ? undefined : 0)}
        draggable
        dragDistance={DRAG_DISTANCE_PX}
        onMouseDown={() => { const r = selectedItemIdsRef.current; if (r.size > 0) selectedItemIdsAtDragStartRef.current = new Set(r) }}
        onDragStart={(ev) => handleItemDragStart(item.id, ev)}
        onDragMove={handleItemDragMove}
        onDragEnd={(e) => handleItemDragEnd(item.id, e)}
      >
        {/* Filled polygon — stable key so drag doesn't leave trace artifacts */}
        <Line key={`poly-${item.id}`} points={pts} closed
          fill={def.color + (isSel ? '50' : '30')}
          stroke={isSel ? SEL_COLOR : def.color} strokeWidth={pw}
          lineCap="round" lineJoin="round"
          tension={isCirclePolygon ? 0 : 0}
          onClick={(e: any) => handleShapeClick(e, item.id)}
          onDblClick={isCirclePolygon ? undefined : (e: any) => handleLineDblClick(item.id, e)}
          hitStrokeWidth={sz(S.hit)}
        />

        {/* Per-segment length labels (only when selected, calibrated, and NOT a circle polygon) */}
        {!isCirclePolygon && isCalibrated && isSel && cVerts.length >= 2 && cVerts.map(([x, y], i) => {
          const next = cVerts[(i + 1) % cVerts.length]
          return <React.Fragment key={`pseg-${i}`}>
            {renderSegLabel(x, y, next[0], next[1], def.color)}
          </React.Fragment>
        })}

        {/* Single centered label at centroid — same style as polyline "Total:" (dark pill, white text) */}
        {renderTag(polygonLabel, labelCx, labelCy, 'rgba(0,0,0,0.72)', '#ffffff', S.font, 0, `polygon-${item.id}`)}

        {/* Vertex handles — hidden for circle polygons (smooth circle) */}
        {!isCirclePolygon && uniqueVerts.map(([nx, ny], idx) => {
          const [vx, vy] = denorm(nx, ny)
          const hov = hoveredVertex?.itemId === item.id && hoveredVertex?.idx === idx
          const sel = selectedVertex?.itemId === item.id && selectedVertex?.idx === idx
          return (
            <Circle key={`v${idx}`} x={vx + ox} y={vy + oy}
              radius={hov || sel ? vrH : vr}
              fill={hov ? 'rgba(0,0,0,0.7)' : sel ? '#fff' : 'rgba(255,255,255,0.8)'}
              stroke={def.color} strokeWidth={vs}
              draggable
              onMouseDown={(e) => { e.cancelBubble = true }}
              onDragStart={(e) => { e.cancelBubble = true; setIsDragging(true) }}
              onDragEnd={(e) => { e.cancelBubble = true; handleVertexDragEnd(item.id, idx, { x: e.target.x(), y: e.target.y() }) }}
              onClick={(e) => {
                e.cancelBubble = true
                const next = new Set([item.id])
                selectedItemIdsRef.current = next
                setSelectedItemIds(next)
                setSelectedVertex({ itemId: item.id, idx })
              }}
              onMouseEnter={(e) => { setHoveredVertex({ itemId: item.id, idx }); e.target.getStage()!.container().style.cursor = 'move' }}
              onMouseLeave={(e) => { setHoveredVertex(null); e.target.getStage()!.container().style.cursor = '' }}
            />
          )
        })}
      </Group>
    )
  }

  /* ═══════════════════════════════════════════════════════════
   *  RENDER: Drawing in progress + live measurements
   * ═══════════════════════════════════════════════════════════ */

  function renderDrawingInProgress() {
    // Shape drawing preview (rect, circle/ellipse, or triangle)
    if (drawingState.type === 'drawing_rect' && cursorPos && activeCount) {
      const [sx, sy] = denorm(drawingState.start[0], drawingState.start[1])
      const ex = cursorPos.x, ey = cursorPos.y
      const col = activeCount.color

      if (activeCount.shape === 'circle') {
        const cx = (sx + ex) / 2, cy = (sy + ey) / 2
        const rx = Math.abs(ex - sx) / 2, ry = Math.abs(ey - sy) / 2
        return (
          <Group listening={false}>
            <Ellipse x={cx} y={cy} radiusX={rx} radiusY={ry}
              fill={col + '30'} stroke={col} strokeWidth={sz(2)} dash={[sz(6), sz(4)]} />
          </Group>
        )
      }

      if (activeCount.shape === 'triangle') {
        const midX = (sx + ex) / 2
        const triPts = [midX, Math.min(sy, ey), Math.max(sx, ex), Math.max(sy, ey), Math.min(sx, ex), Math.max(sy, ey)]
        return (
          <Group listening={false}>
            <Line points={triPts} closed fill={col + '30'} stroke={col} strokeWidth={sz(2)} dash={[sz(6), sz(4)]} />
          </Group>
        )
      }

      return (
        <Group listening={false}>
          <Rect
            x={Math.min(sx, ex)} y={Math.min(sy, ey)}
            width={Math.abs(ex - sx)} height={Math.abs(ey - sy)}
            fill={col + '30'} stroke={col} strokeWidth={sz(2)} dash={[sz(6), sz(4)]}
          />
        </Group>
      )
    }

    // Rectangle polygon preview (2-click rectangle for area_perimeter)
    if (drawingState.type === 'drawing_rect_polygon' && cursorPos && activeCount) {
      const [sx, sy] = denorm(drawingState.start[0], drawingState.start[1])
      const ex = cursorPos.x, ey = cursorPos.y
      const col = activeCount.color
      return (
        <Group listening={false}>
          <Rect
            x={Math.min(sx, ex)} y={Math.min(sy, ey)}
            width={Math.abs(ex - sx)} height={Math.abs(ey - sy)}
            fill={col + '30'} stroke={col} strokeWidth={sz(2)} dash={[sz(6), sz(4)]}
          />
        </Group>
      )
    }

    // Circle polygon preview (2-click circle for area_perimeter)
    if (drawingState.type === 'drawing_circle_polygon' && cursorPos && activeCount) {
      const [cx, cy] = denorm(drawingState.center[0], drawingState.center[1])
      const r = dist(cx, cy, cursorPos.x, cursorPos.y)
      const col = activeCount.color
      return (
        <Group listening={false}>
          <Circle x={cx} y={cy} radius={r}
            fill={col + '30'} stroke={col} strokeWidth={sz(2)} dash={[sz(6), sz(4)]} />
        </Group>
      )
    }

    if (drawingState.type === 'idle' || drawingState.type === 'drawing_rect' || drawingState.type === 'drawing_rect_polygon' || drawingState.type === 'drawing_circle_polygon' || !activeCount) return null
    const verts = drawingState.vertices
    if (verts.length === 0) return null

    const isPoly = drawingState.type === 'drawing_polygon'
    const color = activeCount.color
    const cV = verts.map(([nx, ny]) => denorm(nx, ny))
    const flatPts: number[] = []
    cV.forEach(([x, y]) => flatPts.push(x, y))

    const drawW = sz(isPoly ? S.polyW : S.lineW)
    const dashOn = sz(S.dashOn)
    const dashOff = sz(S.dashOff)
    const vr = sz(S.vert)
    const vrH = sz(S.vertHover)
    const vs = sz(2)

    let nearFirst = false
    if (isPoly && verts.length >= 3 && cursorPos) {
      nearFirst = dist(cursorPos.x, cursorPos.y, cV[0][0], cV[0][1]) < sz(S.snap)
    }

    // Running total length
    let runningFt = 0
    for (let i = 1; i < cV.length; i++) {
      runningFt += dist(cV[i - 1][0], cV[i - 1][1], cV[i][0], cV[i][1]) * fpp
    }

    // Current segment from last vertex to cursor
    let curSegFt = 0
    if (cursorPos && cV.length >= 1) {
      const last = cV[cV.length - 1]
      curSegFt = dist(last[0], last[1], cursorPos.x, cursorPos.y) * fpp
    }

    // Live area (polygon only)
    let liveArea = 0
    if (isPoly && verts.length >= 2 && cursorPos) {
      const [cnx, cny] = norm(cursorPos.x, cursorPos.y)
      const tempVerts = [...verts, [cnx, cny]]
      const closed = [...tempVerts, tempVerts[0]]
      liveArea = calcArea(closed)
    }

    return (
      <Group listening={false}>
        {/* Drawn segments */}
        {verts.length >= 2 && (
          <Line points={flatPts} stroke={color} strokeWidth={drawW}
            lineCap="round" lineJoin="round" dash={[dashOn, dashOff]} />
        )}

        {/* Polygon preview fill */}
        {isPoly && verts.length >= 3 && (
          <Line points={flatPts} closed fill={color + '18'} stroke="transparent" strokeWidth={0} />
        )}

        {/* Preview line to cursor */}
        {cursorPos && cV.length >= 1 && (
          <Line
            points={[
              cV[cV.length - 1][0], cV[cV.length - 1][1],
              nearFirst ? cV[0][0] : cursorPos.x, nearFirst ? cV[0][1] : cursorPos.y,
            ]}
            stroke={color} strokeWidth={sz(2)}
            dash={[sz(6), sz(4)]} opacity={0.7}
          />
        )}

        {/* Polygon: ghost line back to first vertex */}
        {isPoly && cursorPos && verts.length >= 2 && !nearFirst && (
          <Line
            points={[cursorPos.x, cursorPos.y, cV[0][0], cV[0][1]]}
            stroke={color} strokeWidth={sz(1)}
            dash={[sz(4), sz(6)]} opacity={0.3}
          />
        )}

        {/* Existing segment-length labels (only when calibrated) */}
        {isCalibrated && cV.length >= 2 && cV.map(([x, y], i) => {
          if (i === 0) return null
          return <React.Fragment key={`dseg-${i}`}>
            {renderSegLabel(cV[i - 1][0], cV[i - 1][1], x, y, color)}
          </React.Fragment>
        })}

        {/* Live current-segment label near cursor */}
        {isCalibrated && cursorPos && cV.length >= 1 && curSegFt > 0.1 && (
          renderTag(formatFt(curSegFt), cursorPos.x + sz(24), cursorPos.y - sz(24),
            'rgba(0,0,0,0.82)', '#ffffff', S.font)
        )}

        {/* Live running total / area */}
        {isCalibrated && isPoly && verts.length >= 2 && cursorPos && liveArea > 0 && (
          renderTag(formatSqft(liveArea),
            cV.reduce((s, [x]) => s + x, 0) / cV.length,
            cV.reduce((s, [, y]) => s + y, 0) / cV.length,
            color + 'CC', '#fff', S.font)
        )}
        {isCalibrated && !isPoly && verts.length >= 1 && runningFt + curSegFt > 0.1 && cursorPos && (
          renderTag(`Total: ${formatFt(runningFt + curSegFt)}`,
            cV[0][0], cV[0][1] - sz(24),
            'rgba(0,0,0,0.82)', '#ffffff', S.fontSm)
        )}

        {/* Vertex dots */}
        {cV.map(([x, y], idx) => {
          const isFirst = idx === 0 && isPoly && verts.length >= 3
          return (
            <Circle key={`dv${idx}`} x={x} y={y}
              radius={isFirst && nearFirst ? vrH + sz(2) : vr}
              fill={isFirst && nearFirst ? color : 'rgba(255,255,255,0.6)'}
              stroke={color}
              strokeWidth={isFirst && nearFirst ? sz(3) : vs}
            />
          )
        })}
      </Group>
    )
  }

  /* ═══════════════════════════════════════════════════════════
   *  RENDER: Crosshair (linear + area modes)
   * ═══════════════════════════════════════════════════════════ */

  function renderCrosshair() {
    if (!showCrosshair || !cursorPos) return null
    const cx = cursorPos.x, cy = cursorPos.y
    const arm = sz(S.crossArm), gap = sz(S.crossGap)
    const guideW = sz(0.5), shadowW = sz(3.5), lineW = sz(2), dotR = sz(1.5)

    return (
      <Group listening={false}>
        {/* Thin guide lines across full canvas */}
        <Line points={[0, cy, cx - arm - sz(2), cy]} stroke="rgba(180,180,180,0.4)" strokeWidth={guideW} />
        <Line points={[cx + arm + sz(2), cy, width, cy]} stroke="rgba(180,180,180,0.4)" strokeWidth={guideW} />
        <Line points={[cx, 0, cx, cy - arm - sz(2)]} stroke="rgba(180,180,180,0.4)" strokeWidth={guideW} />
        <Line points={[cx, cy + arm + sz(2), cx, height]} stroke="rgba(180,180,180,0.4)" strokeWidth={guideW} />
        {/* Shadow arms */}
        <Line points={[cx - arm, cy, cx - gap, cy]} stroke="rgba(0,0,0,0.5)" strokeWidth={shadowW} lineCap="round" />
        <Line points={[cx + gap, cy, cx + arm, cy]} stroke="rgba(0,0,0,0.5)" strokeWidth={shadowW} lineCap="round" />
        <Line points={[cx, cy - arm, cx, cy - gap]} stroke="rgba(0,0,0,0.5)" strokeWidth={shadowW} lineCap="round" />
        <Line points={[cx, cy + gap, cx, cy + arm]} stroke="rgba(0,0,0,0.5)" strokeWidth={shadowW} lineCap="round" />
        {/* White arms */}
        <Line points={[cx - arm, cy, cx - gap, cy]} stroke="#fff" strokeWidth={lineW} lineCap="round" />
        <Line points={[cx + gap, cy, cx + arm, cy]} stroke="#fff" strokeWidth={lineW} lineCap="round" />
        <Line points={[cx, cy - arm, cx, cy - gap]} stroke="#fff" strokeWidth={lineW} lineCap="round" />
        <Line points={[cx, cy + gap, cx, cy + arm]} stroke="#fff" strokeWidth={lineW} lineCap="round" />
        {/* Center dot */}
        <Circle x={cx} y={cy} radius={dotR} fill="#fff" stroke="rgba(0,0,0,0.5)" strokeWidth={sz(1)} />
      </Group>
    )
  }

  /* ═══════════════════════════════════════════════════════════
   *  RENDER: Calibration overlay with distance label
   * ═══════════════════════════════════════════════════════════ */

  function renderCalibrationOverlay() {
    if (!isCalibrating) return null
    const r = sz(S.calDot)
    const lw = sz(2.5)

    return (
      <Group listening={false}>
        {calPoint1 && (
          <>
            <Circle x={calPoint1.x} y={calPoint1.y} radius={r}
              fill="rgba(59,130,246,0.3)" stroke="#3b82f6" strokeWidth={sz(2)} />
            {cursorPos && (
              <>
                <Line
                  points={[calPoint1.x, calPoint1.y, cursorPos.x, cursorPos.y]}
                  stroke="#3b82f6" strokeWidth={lw}
                  dash={[sz(8), sz(4)]}
                />
                <Circle x={cursorPos.x} y={cursorPos.y} radius={r * 0.7}
                  fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth={sz(1.5)} />
                {/* Pixel-distance label */}
                {renderTag(
                  `${dist(calPoint1.x, calPoint1.y, cursorPos.x, cursorPos.y).toFixed(0)} px`,
                  (calPoint1.x + cursorPos.x) / 2,
                  (calPoint1.y + cursorPos.y) / 2,
                  'rgba(37,99,235,0.85)', '#fff',
                )}
              </>
            )}
          </>
        )}
      </Group>
    )
  }

  /* ═══════════════════════════════════════════════════════════
   *  RENDER: Scale bar (bottom-left of canvas)
   * ═══════════════════════════════════════════════════════════ */

  function renderScaleBar() {
    if (!isCalibrated || fpp <= 0 || !isFinite(fpp)) return null

    // Pick a "nice" length that produces a bar of ~80-150 screen px
    const nice = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000]
    const targetScreenPx = 140
    const targetCanvasPx = sz(targetScreenPx)
    const targetFt = targetCanvasPx * fpp

    let barFt = nice.find(n => n >= targetFt * 0.4 && n <= targetFt * 2.5) ?? 10
    const barCanvasPx = barFt / fpp
    const barLabel = barFt >= 1 ? `${barFt}'` : `${Math.round(barFt * 12)}"`

    const x = sz(16)
    const y = height - sz(16)
    const tickH = sz(8)
    const lw = sz(2)
    const fs = sz(14)

    return (
      <Group listening={false}>
        <Rect x={x - sz(4)} y={y - sz(20)} width={barCanvasPx + sz(8)} height={sz(28)}
          fill="rgba(255,255,255,0.8)" cornerRadius={sz(3)} />
        <Line points={[x, y, x + barCanvasPx, y]} stroke="#333" strokeWidth={lw} />
        <Line points={[x, y, x, y - tickH]} stroke="#333" strokeWidth={lw} />
        <Line points={[x + barCanvasPx, y, x + barCanvasPx, y - tickH]} stroke="#333" strokeWidth={lw} />
        <Text x={x} y={y - sz(16)} text={barLabel}
          fontSize={fs} fill="#333" fontStyle="bold"
          fontFamily="Inter, system-ui, sans-serif"
          rotation={-rotation} />
      </Group>
    )
  }

  /* ═══════════════════════════════════════════════════════════
   *  RENDER: Sticky Notes
   * ═══════════════════════════════════════════════════════════ */

  /* ═══════════════════════════════════════════════════════════
   *  OVERLAY IMAGE (background image overlay on canvas)
   * ═══════════════════════════════════════════════════════════ */

  const [overlayImgEl, setOverlayImgEl] = useState<HTMLImageElement | null>(null)
  const overlayNodeRef = useRef<any>(null)
  const overlayTrRef = useRef<any>(null)

  useEffect(() => {
    if (!overlayImage?.url) { setOverlayImgEl(null); return }
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setOverlayImgEl(img)
    img.onerror = () => setOverlayImgEl(null)
    img.src = overlayImage.url
    return () => { img.onload = null; img.onerror = null }
  }, [overlayImage?.url])

  useEffect(() => {
    if (overlayEditing && overlayTrRef.current && overlayNodeRef.current) {
      overlayTrRef.current.nodes([overlayNodeRef.current])
      overlayTrRef.current.getLayer()?.batchDraw()
    }
  }, [overlayEditing, overlayImgEl])

  const overlayRenderW = overlayImgEl && overlayImage
    ? width * overlayImage.scale
    : 0
  const overlayRenderH = overlayImgEl && overlayImage
    ? overlayRenderW * (overlayImgEl.naturalHeight / overlayImgEl.naturalWidth)
    : 0

  const handleOverlayDragEnd = useCallback((e: any) => {
    if (!onOverlayTransformChange || !overlayImage) return
    const node = e.target
    onOverlayTransformChange({
      scale: overlayImage.scale,
      offset_x: node.x() / width,
      offset_y: node.y() / height,
    })
  }, [onOverlayTransformChange, overlayImage, width, height])

  const handleOverlayTransformEnd = useCallback((e: any) => {
    if (!onOverlayTransformChange) return
    const node = overlayNodeRef.current
    if (!node) return
    const scaleXNode = node.scaleX()
    const newW = node.width() * scaleXNode
    const newScale = newW / width
    node.scaleX(1)
    node.scaleY(1)
    node.width(newW)
    node.height(node.height() * scaleXNode)
    onOverlayTransformChange({
      scale: newScale,
      offset_x: node.x() / width,
      offset_y: node.y() / height,
    })
  }, [onOverlayTransformChange, width, height])

  /* ═══════════════════════════════════════════════════════════
   *  MAIN RENDER
   * ═══════════════════════════════════════════════════════════ */

  return (
    <div
      className="viewer-canvas-wrapper"
      data-cursor={showCrosshair ? 'none' : undefined}
      style={{ pointerEvents: panMode || spacePressed ? 'none' : undefined }}
    >
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleStageMouseUp}
        style={{ cursor: cursorStyle }}
      >
        {/* Layer 1: overlay background image (below count shapes) */}
        {overlayImgEl && overlayImage && (
          <Layer listening={overlayEditing}>
            <Image
              ref={overlayNodeRef}
              image={overlayImgEl}
              x={(overlayImage.offset_x || 0) * width}
              y={(overlayImage.offset_y || 0) * height}
              width={overlayRenderW}
              height={overlayRenderH}
              opacity={overlayEditing ? 0.7 : 0.85}
              draggable={overlayEditing}
              onDragEnd={handleOverlayDragEnd}
              onTransformEnd={handleOverlayTransformEnd}
            />
            {overlayEditing && (
              <Transformer
                ref={overlayTrRef}
                keepRatio={true}
                enabledAnchors={[
                  'top-left',
                  'top-right',
                  'bottom-left',
                  'bottom-right',
                  'top-center',
                  'bottom-center',
                  'middle-left',
                  'middle-right',
                ]}
                boundBoxFunc={(oldBox, newBox) => {
                  if (newBox.width < 20 || newBox.height < 20) return oldBox
                  return newBox
                }}
                rotateEnabled={false}
                borderStroke="#2563eb"
                borderStrokeWidth={sz(2)}
                anchorFill="#ffffff"
                anchorStroke="#2563eb"
                anchorSize={sz(10)}
                anchorCornerRadius={3}
                padding={sz(14)}
              />
            )}
          </Layer>
        )}

        {/* Layer 2: interactive shapes — capture selection on mousedown so multi-drag has correct set */}
        <Layer
          onMouseDown={() => {
            const refNow = selectedItemIdsRef.current
            if (refNow.size > 0) {
              selectedItemIdsAtDragStartRef.current = new Set(refNow)
            }
          }}
        >
          {visibleItems.map((item) => {
            const def = countDefinitions.find((d) => d.id === item.count_definition)
            if (!def) return null
            const idsAtStart = selectedItemIdsAtDragStartRef.current
            const isMultiDrag = (multiDragOffsetRef.current ?? multiDragOffset) && idsAtStart.size > 1
            const isDraggedItem = draggedItemIdRef.current === item.id
            const offsetValue = multiDragOffsetRef.current ?? multiDragOffset
            const dragOffset = (isMultiDrag && idsAtStart.has(item.id) && !isDraggedItem) ? offsetValue : null
            const effectiveBase = (isMultiDrag && idsAtStart.has(item.id) && !isDraggedItem && multiDragBasesRef.current.size > 0)
              ? (multiDragBasesRef.current.get(item.id) ?? getItemBasePosition(item))
              : null
            if (item.geometry_type === 'point') return renderMarker(item, def, dragOffset, effectiveBase)
            if (item.geometry_type === 'rect') return renderRect(item, def, dragOffset, effectiveBase)
            if (item.geometry_type === 'circle') return renderCircleShape(item, def, dragOffset, effectiveBase)
            if (item.geometry_type === 'triangle') return renderTriangleShape(item, def, dragOffset, effectiveBase)
            if (item.geometry_type === 'polyline') return renderPolyline(item, def, dragOffset, effectiveBase)
            if (item.geometry_type === 'polygon') return renderPolygon(item, def, dragOffset, effectiveBase)
            return null
          })}
          {renderDrawingInProgress()}
        </Layer>

        {/* Layer 3: non-interactive overlays */}
        <Layer listening={false}>
          {renderScaleBar()}
          {renderCalibrationOverlay()}
          {renderCrosshair()}
        </Layer>
      </Stage>
    </div>
  )
}
