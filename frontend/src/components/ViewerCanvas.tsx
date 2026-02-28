import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Stage, Layer, Line, Circle, Ellipse, Rect, RegularPolygon, Group, Text } from 'react-konva'
import type { CountItem, CountDefinition } from '../api'
import { createCountItem, deleteCountItem, updateCountItem } from '../api'
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
}

type DrawingState =
  | { type: 'idle' }
  | { type: 'drawing_polyline'; vertices: number[][] }
  | { type: 'drawing_polygon'; vertices: number[][] }
  | { type: 'drawing_rect'; start: [number, number] }

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
  marker:       20,     // marker icon size
  vert:         6,      // vertex handle radius
  vertHover:    9,      // vertex handle radius on hover
  lineW:        2,      // polyline stroke (matches drawing preview feel)
  polyW:        2,      // polygon stroke
  hit:          18,     // invisible hit area
  snap:         22,     // snap-to-close distance
  crossArm:     18,     // crosshair arm length
  crossGap:     5,      // crosshair center gap
  dashOn:       10,
  dashOff:      5,
  font:         12,     // measurement label font
  fontSm:       10,     // segment label font
  pad:          5,      // label padding
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
}: ViewerCanvasProps) {

  /* ─── State ─── */

  const [drawingState, setDrawingState] = useState<DrawingState>({ type: 'idle' })
  const [hoveredVertex, setHoveredVertex] = useState<{ itemId: number; idx: number } | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [selectedVertex, setSelectedVertex] = useState<{ itemId: number; idx: number } | null>(null)
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
  const [cPressed, setCPressed] = useState(false)
  const [spacePressed, setSpacePressed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const clipboardRef = useRef<CountItem | null>(null)
  const stageRef = useRef<any>(null)
  const lastClickTimeRef = useRef(0)
  const lastClickPosRef = useRef<{ x: number; y: number } | null>(null)
  const countItemsRef = useRef<CountItem[]>(countItems)

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
  const isDrawingMode = !isCalibrating && showCounts && activeCount != null && !panMode && !spacePressed
  const showCrosshair = isDrawingMode && activeCount!.count_type !== 'each'

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
      // Update server first - but IGNORE the geometry in the response, use our calculated one
      const u = await updateCountItem(itemId, updates)
      
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
        // Copy selected item
        if (selectedItemId != null && drawingState.type === 'idle' && !isDragging) {
          e.preventDefault()
          e.stopImmediatePropagation()
          const item = countItems.find((i) => i.id === selectedItemId)
          if (item) {
            clipboardRef.current = JSON.parse(JSON.stringify(item)) // Deep copy
            console.log('Copied item:', item.id, item.geometry_type)
          }
          return
        }
      }
      
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        // Paste copied item with slight offset
        if (!clipboardRef.current || drawingState.type !== 'idle' || isDragging) return
        e.preventDefault()
        e.stopImmediatePropagation()
        const src = clipboardRef.current
        const dx = sz(16)
        const dy = sz(16)
        const newGeom = src.geometry.map(([nx, ny]) => {
          const [x, y] = denorm(nx, ny)
          return norm(x + dx, y + dy)
        })
        const doPaste = async () => {
          try {
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
            const item = await createCountItem(base as any)
            onCountItemCreated(item)
            setSelectedItemId(item.id)
            console.log('Pasted item:', item.id)
          } catch (err) {
            console.error('Paste item failed:', err)
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
        else if (drawingState.type !== 'idle')
          setDrawingState({ type: 'idle' })
        setSelectedItemId(null)
        setSelectedVertex(null)
      } else if (e.key === 'Enter') {
        // Finish both polylines AND polygons
        if (drawingState.type === 'drawing_polyline' && drawingState.vertices.length >= 2)
          void finishPolyline(drawingState.vertices)
        else if (drawingState.type === 'drawing_polygon' && drawingState.vertices.length >= 3)
          void finishPolygon(drawingState.vertices)
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        // During drawing: remove last vertex
        if (drawingState.type === 'drawing_polyline' || drawingState.type === 'drawing_polygon') {
          const v = drawingState.vertices
          if (v.length <= 1) setDrawingState({ type: 'idle' })
          else setDrawingState({ ...drawingState, vertices: v.slice(0, -1) })
        } else if (drawingState.type === 'drawing_rect') {
          setDrawingState({ type: 'idle' })
        } else if (selectedVertex) {
          void removeVertex(selectedVertex.itemId, selectedVertex.idx)
        } else if (selectedItemId) {
          void deleteItem(selectedItemId)
        }
      } else if (e.key === ' ') {
        e.preventDefault()
        setSpacePressed(true)
      } else if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) setCPressed(true)
      } else if (
        drawingState.type === 'idle' &&
        !isDragging &&
        selectedItemId != null &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        // Nudge selected item with arrow keys
        e.preventDefault()
        const stepScreen = e.shiftKey ? 10 : 2
        const delta = sz(stepScreen)
        let dx = 0
        let dy = 0
        if (e.key === 'ArrowLeft') dx = -delta
        else if (e.key === 'ArrowRight') dx = delta
        else if (e.key === 'ArrowUp') dy = -delta
        else if (e.key === 'ArrowDown') dy = delta
        void offsetItemGeometry(selectedItemId, dx, dy)
      }
    }
    function onUp(e: KeyboardEvent) {
      if (e.key === ' ') setSpacePressed(false)
      else if (e.key === 'c' || e.key === 'C') setCPressed(false)
    }
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => { window.removeEventListener('keydown', onDown, true); window.removeEventListener('keyup', onUp, true) }
  }, [drawingState, selectedItemId, selectedVertex, countItems, isCalibrated, pageId, sz, isDragging, onCountItemCreated, setSelectedItemId, finishPolyline, finishPolygon, removeVertex, deleteItem])

  /* ═══════════════════════════════════════════════════════════
   *  ACTIONS
   * ═══════════════════════════════════════════════════════════ */

  async function deleteItem(id: number) {
    try { await deleteCountItem(id); onCountItemDeleted(id) }
    catch (err) { console.error('Delete failed:', err) }
    setSelectedItemId(null); setSelectedVertex(null)
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
    try { const u = await updateCountItem(itemId, updates); onCountItemUpdated(u) }
    catch (err) { console.error('Remove vertex failed:', err) }
    setSelectedVertex(null)
  }

  async function finishPolyline(verts: number[][], isRedoRestore?: boolean) {
    if (verts.length >= 2 && activeCount) {
      try {
        const item = await createCountItem({
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
        const item = await createCountItem({
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

    const pos = getCanvasPointer(e.evt)
    if (!pos) return

    // Calibration mode
    if (isCalibrating) {
      if (!calPoint1) { setCalPoint1(pos) }
      else {
        const px = dist(calPoint1.x, calPoint1.y, pos.x, pos.y)
        onCalibrationComplete(px)
      }
      return
    }

    if (!activeCount) {
      if (e.target === e.target.getStage()) { setSelectedItemId(null); setSelectedVertex(null) }
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
      // Double-click finishes the shape, keeping all vertices including
      // the one placed by the first click of the double-click sequence.
      if (drawingState.type === 'drawing_polyline') {
        void finishPolyline(drawingState.vertices)
      } else if (drawingState.type === 'drawing_polygon') {
        void finishPolygon(drawingState.vertices)
      }
      return
    }

    // "Each" type: all shapes support drag-to-draw
    if (activeCount.count_type === 'each' && drawingState.type === 'idle') {
      const [nx, ny] = norm(pos.x, pos.y)
      setDrawingState({ type: 'drawing_rect', start: [nx, ny] })
      return
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
        const item = await createCountItem({
          count_definition: activeCount.id, page: pageId,
          geometry_type: 'point', geometry: [[sx, sy]],
        })
        onCountItemCreated(item)
      } catch (err) { console.error('Create marker failed:', err) }
    } else {
      // Drag: create a shape matching the count definition's shape
      const shapeMap: Record<string, CountItem['geometry_type']> = { circle: 'circle', triangle: 'triangle', square: 'rect' }
      const geoType: CountItem['geometry_type'] = shapeMap[activeCount.shape || 'square'] || 'rect'
      try {
        const item = await createCountItem({
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

  async function handleVertexDragEnd(itemId: number, vIdx: number, newPos: { x: number; y: number }) {
    setIsDragging(false)
    const item = countItems.find((i) => i.id === itemId)
    if (!item) return
    const [nx, ny] = norm(newPos.x, newPos.y)
    const g = [...item.geometry]
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
    try { const u = await updateCountItem(itemId, updates); onCountItemUpdated(u) }
    catch (err) { console.error('Vertex drag failed:', err) }
  }

  function handleShapeClick(e: any, itemId: number) {
    e.cancelBubble = true
    if (cPressed) void deleteItem(itemId)
    else { setSelectedItemId(itemId); setSelectedVertex(null) }
  }

  /* ═══════════════════════════════════════════════════════════
   *  CURSOR
   * ═══════════════════════════════════════════════════════════ */

  const cursorStyle =
    panMode || spacePressed ? 'grab'
    : isCalibrating ? 'crosshair'
    : isDrawingMode ? (activeCount!.count_type === 'each' ? 'crosshair' : 'none')
    : 'default'

  /* ═══════════════════════════════════════════════════════════
   *  DRAGGING ENTIRE ITEMS
   * ═══════════════════════════════════════════════════════════ */

  function handleItemDragStart(itemId: number) {
    setIsDragging(true)
    setSelectedItemId(itemId)
    setSelectedVertex(null)
  }

  async function handleItemDragEnd(itemId: number, e: any) {
    setIsDragging(false)
    const node = e.target.getParent ? e.target.getParent() : e.target
    if (!node) return
    const pos = node.position ? node.position() : { x: 0, y: 0 }
    const dx = pos.x || 0
    const dy = pos.y || 0
    // If there was effectively no movement, just reset the visual offset.
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      if (node.position) node.position({ x: 0, y: 0 })
      return
    }
    // CRITICAL: Update server and state FIRST - wait for it to complete
    // The offsetItemGeometry function already waits for state updates, so we don't need additional delay here
    try {
      await offsetItemGeometry(itemId, dx, dy)
      // NOW reset visual offset after state is fully updated and component has re-rendered
      // The geometry in state is now updated, so Konva will render at the new position
      if (node.position) node.position({ x: 0, y: 0 })
    } catch (err) {
      console.error('Failed to save item position:', err)
      alert('Failed to save position: ' + (err as Error).message)
      // Reset visual offset even on error
      if (node.position) node.position({ x: 0, y: 0 })
    }
  }

  /* ═══════════════════════════════════════════════════════════
   *  RENDER: Reusable measurement tag
   *
   *  Draws a pill-shaped label with semi-transparent bg.
   *  All sizes go through sz() so labels stay readable at
   *  every zoom level.
   * ═══════════════════════════════════════════════════════════ */

  function renderTag(
    text: string, cx: number, cy: number,
    bg = 'rgba(0,0,0,0.72)', fg = '#ffffff',
    fontSize = S.font, offsetY = 0,
  ) {
    const fs = sz(fontSize)
    const px = sz(S.pad + 2)
    const py = sz(S.pad)
    const charW = fs * 0.62
    const tw = text.length * charW
    const bw = tw + px * 2
    const bh = fs + py * 2
    const dy = sz(offsetY)
    return (
      <Group x={cx} y={cy + dy} rotation={-rotation} listening={false}
        key={`tag-${text}-${cx.toFixed(0)}-${cy.toFixed(0)}`}>
        <Rect
          x={-bw / 2} y={-bh / 2}
          width={bw} height={bh}
          fill={bg} cornerRadius={sz(4)}
        />
        <Text
          x={-tw / 2} y={-fs / 2}
          text={text} fontSize={fs}
          fill={fg} fontStyle="bold"
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
   *  Fixed screen-size icons — always appear the same size
   *  regardless of zoom. This is how Toggle.ai works for
   *  count markers.
   * ═══════════════════════════════════════════════════════════ */

  function renderMarker(item: CountItem, def: CountDefinition) {
    const [x, y] = denorm(item.geometry[0][0], item.geometry[0][1])
    const isSel = selectedItemId === item.id
    const size = sz(S.marker)
    const sw = sz(isSel ? 2.5 : 1.5)
    const hit = sz(S.hit)
    const click = (e: any) => handleShapeClick(e, item.id)
    const rotDeg = item.rotation_deg ?? 0

    const common = { onClick: click, hitStrokeWidth: hit }
    const fill = def.color + '30'
    const stroke = isSel ? SEL_COLOR : def.color
    
    // Render marker centered at origin for rotation
    const marker =
      def.shape === 'circle' ? (
        <Circle x={0} y={0} radius={size / 2} fill={fill} stroke={stroke} strokeWidth={sw} {...common} />
      ) : def.shape === 'triangle' ? (
        <RegularPolygon
          x={0}
          y={0}
          sides={3}
          radius={size / 2 + sz(1)}
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
          cornerRadius={sz(2)}
          {...common}
        />
      )

    // Rotation handle for selected markers
    const rotHandle = isSel ? (
      <Circle
        x={0}
        y={-size / 2 - sz(12)}
        radius={sz(4)}
        fill="#fff"
        stroke={SEL_COLOR}
        strokeWidth={sz(1.5)}
        draggable
        onDragStart={(e) => { e.cancelBubble = true }}
        onDragMove={(e) => {
          e.cancelBubble = true
          const stage = stageRef.current
          if (!stage) return
          const pointer = stage.getPointerPosition()
          if (!pointer) return
          const angle = Math.atan2(pointer.x - x, -(pointer.y - y)) * (180 / Math.PI)
          const updates: Partial<CountItem> = { rotation_deg: Math.round(angle) }
          void updateCountItem(item.id, updates).then((u) => onCountItemUpdated(u)).catch(() => {})
          e.target.x(0)
          e.target.y(-size / 2 - sz(12))
        }}
        onDragEnd={(e) => { e.cancelBubble = true }}
        onMouseEnter={(e) => { e.target.getStage()!.container().style.cursor = 'grab' }}
        onMouseLeave={(e) => { e.target.getStage()!.container().style.cursor = '' }}
      />
    ) : null

    return (
      <Group
        key={item.id}
        x={x}
        y={y}
        rotation={rotDeg}
        draggable
        onDragStart={() => handleItemDragStart(item.id)}
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

  function renderRect(item: CountItem, def: CountDefinition) {
    if (item.geometry.length < 2) return null
    const [x1, y1] = denorm(item.geometry[0][0], item.geometry[0][1])
    const [x2, y2] = denorm(item.geometry[1][0], item.geometry[1][1])
    const isSel = selectedItemId === item.id
    const sw = sz(isSel ? 2.5 : 1.5)

    const rx = Math.min(x1, x2)
    const ry = Math.min(y1, y2)
    const rw = Math.abs(x2 - x1)
    const rh = Math.abs(y2 - y1)
    const rotDeg = item.rotation_deg ?? 0
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2

    return (
      <Group
        key={item.id}
        rotation={rotDeg}
        x={cx}
        y={cy}
        offsetX={cx}
        offsetY={cy}
        draggable
        onDragStart={() => handleItemDragStart(item.id)}
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

  function renderCircleShape(item: CountItem, def: CountDefinition) {
    if (item.geometry.length < 2) return null
    const [x1, y1] = denorm(item.geometry[0][0], item.geometry[0][1])
    const [x2, y2] = denorm(item.geometry[1][0], item.geometry[1][1])
    const isSel = selectedItemId === item.id
    const sw = sz(isSel ? 2.5 : 1.5)

    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2
    const rx = Math.abs(x2 - x1) / 2
    const ry = Math.abs(y2 - y1) / 2
    const rotDeg = item.rotation_deg ?? 0
    const topY = cy - Math.max(rx, ry)

    return (
      <Group
        key={item.id}
        rotation={rotDeg}
        x={cx}
        y={cy}
        offsetX={cx}
        offsetY={cy}
        draggable
        onDragStart={() => handleItemDragStart(item.id)}
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
    const handleOffset = sz(20)
    const handleR = sz(6)
    const lineW = sz(1)

    return (
      <Group>
        <Line points={[cx, topY, cx, topY - handleOffset]} stroke={SEL_COLOR} strokeWidth={lineW} />
        <Circle x={cx} y={topY - handleOffset} radius={handleR}
          fill="#fff" stroke={SEL_COLOR} strokeWidth={sz(1.5)}
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
            void updateCountItem(item.id, updates).then((u) => onCountItemUpdated(u)).catch(() => {})
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

  function renderTriangleShape(item: CountItem, def: CountDefinition) {
    if (item.geometry.length < 2) return null
    const [x1, y1] = denorm(item.geometry[0][0], item.geometry[0][1])
    const [x2, y2] = denorm(item.geometry[1][0], item.geometry[1][1])
    const isSel = selectedItemId === item.id
    const sw = sz(isSel ? 2.5 : 1.5)
    const midX = (x1 + x2) / 2
    const topY = Math.min(y1, y2)
    const triPts = [midX, topY, Math.max(x1, x2), Math.max(y1, y2), Math.min(x1, x2), Math.max(y1, y2)]

    const rotDeg = item.rotation_deg ?? 0
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2

    return (
      <Group
        key={item.id}
        rotation={rotDeg}
        x={cx}
        y={cy}
        offsetX={cx}
        offsetY={cy}
        draggable
        onDragStart={() => handleItemDragStart(item.id)}
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

  function renderPolyline(item: CountItem, def: CountDefinition) {
    const pts: number[] = []
    const cVerts: [number, number][] = []
    item.geometry.forEach(([nx, ny]) => {
      const [x, y] = denorm(nx, ny)
      pts.push(x, y); cVerts.push([x, y])
    })
    const isSel = selectedItemId === item.id
    const lw = sz(isSel ? S.lineW + 1 : S.lineW)
    const vr = sz(S.vert)
    const vrH = sz(S.vertHover)
    const vs = sz(2)

    const totalFt = item.length_ft ?? calcLength(item.geometry)
    const [startX, startY] = cVerts.length > 0 ? cVerts[0] : [0, 0]
    const totalLabel = isCalibrated ? `Total: ${formatFt(totalFt)}` : 'Total: —'

    return (
      <Group
        key={item.id}
        draggable
        onDragStart={() => handleItemDragStart(item.id)}
        onDragEnd={(e) => handleItemDragEnd(item.id, e)}
      >
        {/* Hit area */}
        <Line points={pts} stroke="transparent" strokeWidth={sz(S.hit)}
          lineCap="round" lineJoin="round" onClick={(e: any) => handleShapeClick(e, item.id)} />
        {/* Visible line */}
        <Line points={pts} stroke={isSel ? SEL_COLOR : def.color} strokeWidth={lw}
          lineCap="round" lineJoin="round" onClick={(e: any) => handleShapeClick(e, item.id)} />

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
            <Circle key={`v${idx}`} x={vx} y={vy}
              radius={hov || sel ? vrH : vr}
              fill={hov ? 'rgba(0,0,0,0.7)' : sel ? '#fff' : 'rgba(255,255,255,0.8)'}
              stroke={def.color} strokeWidth={vs}
              draggable
              onDragStart={() => { setIsDragging(true) }}
              onDragEnd={(e) => handleVertexDragEnd(item.id, idx, { x: e.target.x(), y: e.target.y() })}
              onClick={(e) => { e.cancelBubble = true; setSelectedItemId(item.id); setSelectedVertex({ itemId: item.id, idx }) }}
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

  function renderPolygon(item: CountItem, def: CountDefinition) {
    const uniqueVerts = item.geometry.slice(0, -1)
    const pts: number[] = []
    const cVerts: [number, number][] = []
    uniqueVerts.forEach(([nx, ny]) => {
      const [x, y] = denorm(nx, ny)
      pts.push(x, y); cVerts.push([x, y])
    })
    const isSel = selectedItemId === item.id
    const pw = sz(isSel ? S.polyW + 1 : S.polyW)
    const vr = sz(S.vert)
    const vrH = sz(S.vertHover)
    const vs = sz(2)

    const areaVal = item.area_sqft ?? calcArea(item.geometry)
    const perimVal = item.perimeter_ft ?? calcPerimeter(item.geometry)
    const [cx, cy] = centroid(item.geometry)
    const areaLabel = isCalibrated ? formatSqft(areaVal) : '—'
    const perimLabel = isCalibrated ? formatFt(perimVal) : '—'

    return (
      <Group
        key={item.id}
        draggable
        onDragStart={() => handleItemDragStart(item.id)}
        onDragEnd={(e) => handleItemDragEnd(item.id, e)}
      >
        {/* Filled polygon */}
        <Line points={pts} closed
          fill={def.color + (isSel ? '50' : '30')}
          stroke={isSel ? SEL_COLOR : def.color} strokeWidth={pw}
          lineCap="round" lineJoin="round"
          onClick={(e: any) => handleShapeClick(e, item.id)}
          hitStrokeWidth={sz(S.hit)}
        />

        {/* Per-segment length labels (only when selected and calibrated) */}
        {isCalibrated && isSel && cVerts.length >= 2 && cVerts.map(([x, y], i) => {
          const next = cVerts[(i + 1) % cVerts.length]
          return <React.Fragment key={`pseg-${i}`}>
            {renderSegLabel(x, y, next[0], next[1], def.color)}
          </React.Fragment>
        })}

        {/* Area label at centroid */}
        {renderTag(areaLabel, cx, cy, def.color + 'DD')}
        {/* Perimeter label below */}
        {renderTag(perimLabel, cx, cy, 'rgba(0,0,0,0.5)', '#fff', S.fontSm, 20)}

        {/* Vertex handles */}
        {uniqueVerts.map(([nx, ny], idx) => {
          const [vx, vy] = denorm(nx, ny)
          const hov = hoveredVertex?.itemId === item.id && hoveredVertex?.idx === idx
          const sel = selectedVertex?.itemId === item.id && selectedVertex?.idx === idx
          return (
            <Circle key={`v${idx}`} x={vx} y={vy}
              radius={hov || sel ? vrH : vr}
              fill={hov ? 'rgba(0,0,0,0.7)' : sel ? '#fff' : 'rgba(255,255,255,0.8)'}
              stroke={def.color} strokeWidth={vs}
              draggable
              onDragStart={() => { setIsDragging(true) }}
              onDragEnd={(e) => handleVertexDragEnd(item.id, idx, { x: e.target.x(), y: e.target.y() })}
              onClick={(e) => { e.cancelBubble = true; setSelectedItemId(item.id); setSelectedVertex({ itemId: item.id, idx }) }}
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

    if (drawingState.type === 'idle' || drawingState.type === 'drawing_rect' || !activeCount) return null
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
    const targetScreenPx = 100
    const targetCanvasPx = sz(targetScreenPx)
    const targetFt = targetCanvasPx * fpp

    let barFt = nice.find(n => n >= targetFt * 0.4 && n <= targetFt * 2.5) ?? 10
    const barCanvasPx = barFt / fpp
    const barLabel = barFt >= 1 ? `${barFt}'` : `${Math.round(barFt * 12)}"`

    const x = sz(16)
    const y = height - sz(16)
    const tickH = sz(6)
    const lw = sz(1.5)
    const fs = sz(9)

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
        {/* Layer 1: interactive shapes */}
        <Layer>
          {visibleItems.map((item) => {
            const def = countDefinitions.find((d) => d.id === item.count_definition)
            if (!def) return null
            if (item.geometry_type === 'point') return renderMarker(item, def)
            if (item.geometry_type === 'rect') return renderRect(item, def)
            if (item.geometry_type === 'circle') return renderCircleShape(item, def)
            if (item.geometry_type === 'triangle') return renderTriangleShape(item, def)
            if (item.geometry_type === 'polyline') return renderPolyline(item, def)
            if (item.geometry_type === 'polygon') return renderPolygon(item, def)
            return null
          })}
          {renderDrawingInProgress()}
        </Layer>

        {/* Layer 2: non-interactive overlays */}
        <Layer listening={false}>
          {renderScaleBar()}
          {renderCalibrationOverlay()}
          {renderCrosshair()}
        </Layer>
      </Stage>
    </div>
  )
}
