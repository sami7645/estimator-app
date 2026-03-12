import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { CountDefinition, CountItem, PlanPage, AutoDetectResult } from '../api'
import { deleteCountDefinition, updateCountDefinition, runAutoDetect, fetchDatasetStats, type DatasetStats } from '../api'
import { useAuth } from '../context/AuthContext'
import CountDefinitionModal from './CountDefinitionModal'
import ScaleControl from './ScaleControl'
import './CountsPanel.css'

const TRADES = [
  { value: 'acoustic', label: 'Acoustic', color: '#6366f1' },
  { value: 'electrical', label: 'Electrical', color: '#f59e0b' },
  { value: 'plumbing', label: 'Plumbing', color: '#3b82f6' },
  { value: 'mechanical', label: 'Mechanical', color: '#10b981' },
  { value: 'other', label: 'Other', color: '#8b5cf6' },
]

interface CountsPanelProps {
  countDefinitions: CountDefinition[]
  countItems: CountItem[]
  selectedPage: PlanPage | null
  activeCountId: number | null
  onActiveCountChange: (id: number | null) => void
  onCountDefinitionCreated: (def: CountDefinition) => void
  onCountDefinitionUpdated: (def: CountDefinition) => void
  onCountDefinitionDeleted: (id: number) => void
  planSetId: number
  onAddToDataset: (trade: string, countDefId?: number) => void
  scale: { realWorldFeet: number; pixelDistance: number }
  onScaleChange: (scale: { realWorldFeet: number; pixelDistance: number }) => void
  hiddenCountIds: Set<number>
  onHiddenCountIdsChange: (ids: Set<number>) => void
  isCalibrated: boolean
  isCalibrating: boolean
  onStartCalibration: () => void
  onCancelCalibration: () => void
  calibrationPixelDist: number | null
  onCalibrationSaved: () => void
  onDetectionsReceived?: (result: AutoDetectResult) => void
  selectedCountIds?: Set<number>
  onSelectedCountIdsChange?: (ids: Set<number>) => void
  /** Extra background images (image_alt + overlays); one row per entry with squared thumbnail */
  pageExtraImages?: { id: 'alt' | number; imageUrl: string; name: string }[]
  /** Which extra image is currently shown (null = plan view) */
  activeExtraImageId?: 'alt' | number | null
  onActiveExtraImageChange?: (id: 'alt' | number | null) => void
  onRenameExtraImage?: (id: 'alt' | number, name: string) => Promise<void> | void
  onDeleteExtraImage?: (id: 'alt' | number) => Promise<void> | void
  editingExtraImageId?: 'alt' | number | null
  onEditExtraImage?: (id: 'alt' | number | null) => void
  onUploadAltClick?: () => void
  uploadAltLoading?: boolean
}

export default function CountsPanel({
  countDefinitions,
  countItems,
  selectedPage,
  activeCountId,
  onActiveCountChange,
  onCountDefinitionCreated,
  onCountDefinitionUpdated,
  onCountDefinitionDeleted,
  planSetId,
  onAddToDataset,
  scale,
  onScaleChange,
  hiddenCountIds,
  onHiddenCountIdsChange,
  isCalibrated,
  isCalibrating,
  onStartCalibration,
  onCancelCalibration,
  calibrationPixelDist,
  onCalibrationSaved,
  onDetectionsReceived,
  selectedCountIds,
  onSelectedCountIdsChange,
  pageExtraImages = [],
  activeExtraImageId = null,
  onActiveExtraImageChange,
  onRenameExtraImage,
  onDeleteExtraImage,
  editingExtraImageId = null,
  onEditExtraImage,
  onUploadAltClick,
  uploadAltLoading = false,
}: CountsPanelProps) {
  const { token } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; countId: number } | null>(null)
  const [imageContextMenu, setImageContextMenu] = useState<{ x: number; y: number; id: 'alt' | number; name: string } | null>(null)
  const [editingCount, setEditingCount] = useState<CountDefinition | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [isDragSelecting, setIsDragSelecting] = useState(false)

  // Section expand/collapse states
  const [isCountsExpanded, setIsCountsExpanded] = useState(true)
  const [selectionMode, setSelectionMode] = useState(false)
  const [showAutoDetect, setShowAutoDetect] = useState(false)
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set())
  const [detecting, setDetecting] = useState(false)
  const [detectResult, setDetectResult] = useState<{ count: number; message: string } | null>(null)
  const [datasetStats, setDatasetStats] = useState<DatasetStats>({})

  const countsListRef = useRef<HTMLDivElement>(null)

  // Dismiss selection mode when clicking outside the counts list
  useEffect(() => {
    if (!selectionMode) return
    function onDocMouseDown(e: MouseEvent) {
      const root = countsListRef.current
      if (!root) return
      if (root.contains(e.target as Node)) return
      setSelectionMode(false)
      onSelectedCountIdsChange?.(new Set())
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [selectionMode, onSelectedCountIdsChange])

  // Dismiss ctrl/cmd multi-select when clicking outside the counts list (left click)
  useEffect(() => {
    if (!onSelectedCountIdsChange) return
    if (!selectedCountIds || selectedCountIds.size === 0) return
    function onDocMouseDown(e: MouseEvent) {
      const root = countsListRef.current
      const menu = contextMenuRef.current
      if (root && root.contains(e.target as Node)) return
      if (menu && menu.contains(e.target as Node)) return
      setSelectionMode(false)
      onSelectedCountIdsChange?.(new Set())
      setContextMenu(null)
      setImageContextMenu(null)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [selectedCountIds, onSelectedCountIdsChange])

  // Also dismiss selection on right-click outside the counts list (covers ctrl+click multi-select too).
  useEffect(() => {
    if (!onSelectedCountIdsChange) return
    if (!selectedCountIds || selectedCountIds.size === 0) return
    function onDocContextMenu(e: MouseEvent) {
      const root = countsListRef.current
      const menu = contextMenuRef.current
      if (root && root.contains(e.target as Node)) return
      if (menu && menu.contains(e.target as Node)) return
      setSelectionMode(false)
      onSelectedCountIdsChange?.(new Set())
      setContextMenu(null)
      setImageContextMenu(null)
    }
    document.addEventListener('contextmenu', onDocContextMenu)
    return () => document.removeEventListener('contextmenu', onDocContextMenu)
  }, [selectedCountIds, onSelectedCountIdsChange])

  const refreshDatasetStats = useCallback(() => {
    if (token) {
      fetchDatasetStats(token, planSetId, selectedPage?.id).then(setDatasetStats).catch(() => {})
    }
  }, [token, planSetId, selectedPage?.id])

  useEffect(() => {
    if (showAutoDetect) refreshDatasetStats()
  }, [showAutoDetect, refreshDatasetStats])

  // Close context menus on outside click
  useEffect(() => {
    if (!contextMenu && !imageContextMenu) return
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
        setImageContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu, imageContextMenu])

  // End drag selection on global mouseup
  useEffect(() => {
    if (!isDragSelecting) return
    function handleMouseUp() { setIsDragSelecting(false) }
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [isDragSelecting])

  function handleCountRowMouseDown(e: React.MouseEvent, countId: number) {
    if (e.button !== 0) return
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedCountIds)
      if (next.has(countId)) next.delete(countId)
      else next.add(countId)
      onSelectedCountIdsChange?.(next)
      onActiveCountChange(countId)
      return
    }
    if (selectionMode) {
      // In selection mode, a normal click toggles selection
      const next = new Set(selectedCountIds)
      if (next.has(countId)) next.delete(countId)
      else next.add(countId)
      onSelectedCountIdsChange?.(next)
      onActiveCountChange(countId)
      return
    }
    // Normal mode: clicking a specific count dismisses any multi-select, then activates this count
    if (selectedCountIds && selectedCountIds.size > 0) {
      onSelectedCountIdsChange?.(new Set())
    }
    onActiveCountChange(activeCountId === countId ? null : countId)
  }

  function handleCountRowMouseEnter(countId: number) {
    if (!isDragSelecting) return
    const next = new Set(selectedCountIds)
    next.add(countId)
    onSelectedCountIdsChange?.(next)
    onActiveCountChange(countId)
  }

  function toggleExpand(id: number) {
    const next = new Set(expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedIds(next)
  }

  function toggleVisible(id: number) {
    const next = new Set(hiddenCountIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onHiddenCountIdsChange(next)
  }

  function handleContextMenu(e: React.MouseEvent, countId: number) {
    e.preventDefault()
    e.stopPropagation()
    // If Ctrl+clicking already built a multi-selection that includes this count,
    // keep it; otherwise treat this as a single-count right-click.
    if (!selectedCountIds?.has(countId)) {
      onSelectedCountIdsChange?.(new Set([countId]))
    }
    setContextMenu({ x: e.clientX, y: e.clientY, countId })
  }

  function handleSelectAllFromMenu() {
    setContextMenu(null)
    setSelectionMode(true)
    onSelectedCountIdsChange?.(new Set(countDefinitions.map((d) => d.id)))
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this count definition and all its items?')) return
    try {
      await deleteCountDefinition(id)
      onCountDefinitionDeleted(id)
    } catch (err) {
      console.error('Failed to delete:', err)
    }
    setContextMenu(null)
  }

  async function handleDeleteSelected() {
    const ids = selectedCountIds ? Array.from(selectedCountIds) : []
    if (ids.length === 0) return
    if (!confirm(`Delete ${ids.length} selected count definition${ids.length > 1 ? 's' : ''} and all their items?`)) return
    setContextMenu(null)
    for (const id of ids) {
      try {
        await deleteCountDefinition(id)
        onCountDefinitionDeleted(id)
      } catch (err) {
        console.error('Failed to delete count', id, err)
      }
    }
    onSelectedCountIdsChange?.(new Set())
  }

  async function handleQuickEditName(countDef: CountDefinition) {
    setContextMenu(null)
    const newName = prompt('Edit count name:', countDef.name)
    if (newName == null || newName.trim() === '' || newName.trim() === countDef.name) return
    try {
      const updated = await updateCountDefinition(countDef.id, { name: newName.trim() })
      onCountDefinitionUpdated(updated)
    } catch (err) {
      console.error('Failed to update name:', err)
    }
  }

  function handleEditFull(countDef: CountDefinition) {
    setContextMenu(null)
    setEditingCount(countDef)
    setShowModal(true)
  }

  function getItemsForDef(defId: number): CountItem[] {
    return countItems.filter((item) => item.count_definition === defId)
  }

  function getCountSummary(countDef: CountDefinition) {
    const items = getItemsForDef(countDef.id)
    if (countDef.count_type === 'area_perimeter') {
      return {
        count: items.length,
        totalArea: items.reduce((s, i) => s + (i.area_sqft || 0), 0),
        totalPerimeter: items.reduce((s, i) => s + (i.perimeter_ft || 0), 0),
      }
    } else if (countDef.count_type === 'linear_feet') {
      return {
        count: items.length,
        totalLength: items.reduce((s, i) => s + (i.length_ft || 0), 0),
      }
    }
    return { count: items.length }
  }

  function formatNum(n: number): string {
    return n < 10 ? n.toFixed(2) : n < 1000 ? n.toFixed(1) : n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  }

  const countDefForContext = contextMenu ? countDefinitions.find((c) => c.id === contextMenu.countId) : null

  async function handleRenameExtraImage(id: 'alt' | number, currentName: string) {
    const next = window.prompt('Rename image', currentName)
    if (next == null) return
    const trimmed = next.trim()
    if (!trimmed) return
    try {
      await onRenameExtraImage?.(id, trimmed)
    } catch (err) {
      alert((err as Error).message || 'Rename failed')
    }
  }

  async function handleDeleteExtraImage(id: 'alt' | number, currentName: string) {
    const ok = window.confirm(`Delete "${currentName}"?`)
    if (!ok) return
    try {
      await onDeleteExtraImage?.(id)
    } catch (err) {
      alert((err as Error).message || 'Delete failed')
    }
  }

  return (
    <aside className="counts-panel">
      <div className="counts-panel-body">

      {/* ── Counts Section ── */}
      <div className="section-wrapper">
        <div className="section-header" onClick={() => setIsCountsExpanded(!isCountsExpanded)}>
          <div className="section-header-left">
            <h3 className="section-title">Counts</h3>
            {countDefinitions.length > 0 && (
              <span className="section-count-badge">{countDefinitions.length}</span>
            )}
          </div>
          <div className="section-header-right">
            <button
              className="section-add-btn"
              onClick={(e) => {
                e.stopPropagation()
                setEditingCount(null)
                setIsCountsExpanded(true)
                setShowModal(true)
              }}
              title="Add Count Definition"
            >
              +
            </button>
            <button
              className="section-expand-btn"
              onClick={(e) => {
                e.stopPropagation()
                setIsCountsExpanded(!isCountsExpanded)
              }}
              title={isCountsExpanded ? 'Collapse' : 'Expand'}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: isCountsExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>

        {isCountsExpanded && (
          <div className="section-body">
      <div
        ref={countsListRef}
        className={`counts-list ${selectionMode ? 'selection-mode' : ''}`}
      >
        {/* One row per extra image (image_alt + overlays); squared thumbnail like color dot; eye = show this image as background */}
        {selectedPage && pageExtraImages.length > 0 && onActiveExtraImageChange && pageExtraImages.map((entry, index) => {
          const isActive = activeExtraImageId === entry.id
          const isEditingThis = editingExtraImageId === entry.id
          return (
            <div
              key={entry.id}
              className={`count-row image-count-row ${isActive ? 'active' : ''}`}
              onClick={() => onActiveExtraImageChange(isActive ? null : entry.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setImageContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  id: entry.id,
                  name: entry.name || `Image ${index + 1}`,
                })
              }}
            >
              <div className="count-row-header">
                <span className="expand-btn expand-btn-placeholder" aria-hidden />
                <button
                  className={`eye-btn ${isActive ? '' : 'off'}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onActiveExtraImageChange(isActive ? null : entry.id)
                  }}
                  title={isActive ? 'Showing this image (click to show plan)' : 'Show this image as background'}
                >
                  {isActive ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  )}
                </button>
                {onEditExtraImage && (
                  <button
                    className={`eye-btn edit-transform-btn ${isEditingThis ? 'editing' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!isActive) onActiveExtraImageChange(entry.id)
                      onEditExtraImage(isEditingThis ? null : entry.id)
                    }}
                    title={isEditingThis ? 'Finish editing transform' : 'Edit image position & size'}
                  >
                    {isEditingThis ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    )}
                  </button>
                )}
                <div className="count-info">
                  <span className="count-image-thumb" title="Alternate / overlay image">
                    <img src={entry.imageUrl} alt="" />
                  </span>
                  <span className="count-name">{entry.name || `Image ${index + 1}`}</span>
                </div>
              </div>
            </div>
          )
        })}
        {countDefinitions.map((countDef, idx) => {
          const isExpanded = expandedIds.has(countDef.id)
          const isHidden = hiddenCountIds.has(countDef.id)
          const isActive = activeCountId === countDef.id
          const summary = getCountSummary(countDef)
          const items = getItemsForDef(countDef.id)

          return (
            <div
              key={countDef.id}
              className={`count-row ${isActive ? 'active' : ''} ${isHidden ? 'hidden-count' : ''} ${selectedCountIds?.has(countDef.id) ? 'multi-selected' : ''}`}
              onMouseDown={(e) => handleCountRowMouseDown(e, countDef.id)}
              onMouseEnter={() => handleCountRowMouseEnter(countDef.id)}
              onContextMenu={(e) => handleContextMenu(e, countDef.id)}
            >
              <div className="count-row-header">
                {selectionMode && onSelectedCountIdsChange && (
                  <label
                    className="count-row-checkbox-wrap"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    title={selectedCountIds?.has(countDef.id) ? 'Unselect' : 'Select'}
                  >
                    <input
                      type="checkbox"
                      className="count-row-checkbox"
                      checked={selectedCountIds?.has(countDef.id) ?? false}
                      onChange={() => {
                        const next = new Set(selectedCountIds ?? [])
                        if (next.has(countDef.id)) next.delete(countDef.id)
                        else next.add(countDef.id)
                        onSelectedCountIdsChange(next)
                      }}
                    />
                  </label>
                )}
                <button
                  className="expand-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleExpand(countDef.id)
                  }}
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                <button
                  className={`eye-btn ${isHidden ? 'off' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleVisible(countDef.id)
                  }}
                  title={isHidden ? 'Show on plan' : 'Hide from plan'}
                >
                  {isHidden ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
                <div className="count-info">
                  <span className="count-color-dot" style={{ backgroundColor: countDef.color }} />
                  <span className="count-name">{countDef.name}</span>
                  <span className="count-badge">{summary.count}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="count-details" onClick={(e) => e.stopPropagation()}>
                  {/* Type label */}
                  <div className="count-type-label">
                    {countDef.count_type === 'area_perimeter'
                      ? 'Area & Perimeter'
                      : countDef.count_type === 'linear_feet'
                        ? 'Linear Feet'
                        : 'Each'}
                    <span className="count-trade-badge">{countDef.trade}</span>
                  </div>

                  {/* Per-item details */}
                  {countDef.count_type === 'area_perimeter' && items.length > 0 && (
                    <div className="count-items-list">
                      {items.map((item, i) => (
                        <div key={item.id} className="count-item-row">
                          <span className="count-item-label">Polygon {i + 1}</span>
                          <span className="count-item-value">{formatNum(item.area_sqft || 0)} sqft</span>
                          <span className="count-item-value">{formatNum(item.perimeter_ft || 0)} ft</span>
                        </div>
                      ))}
                      <div className="count-totals-row">
                        <span className="count-totals-label">Total</span>
                        <span className="count-totals-value">
                          {formatNum((summary as any).totalArea || 0)} sqft
                        </span>
                        <span className="count-totals-value">
                          {formatNum((summary as any).totalPerimeter || 0)} ft
                        </span>
                      </div>
                    </div>
                  )}

                  {countDef.count_type === 'linear_feet' && items.length > 0 && (
                    <div className="count-items-list">
                      {items.map((item, i) => (
                        <div key={item.id} className="count-item-row">
                          <span className="count-item-label">Line {i + 1}</span>
                          <span className="count-item-value">{formatNum(item.length_ft || 0)} ft</span>
                        </div>
                      ))}
                      <div className="count-totals-row">
                        <span className="count-totals-label">Total</span>
                        <span className="count-totals-value">
                          {formatNum((summary as any).totalLength || 0)} ft
                        </span>
                      </div>
                    </div>
                  )}

                  {countDef.count_type === 'each' && (
                    <div className="count-items-list">
                      <div className="count-totals-row">
                        <span className="count-totals-label">Total Markers</span>
                        <span className="count-totals-value">{summary.count}</span>
                      </div>
                    </div>
                  )}

                  {items.length === 0 && (
                    <div className="count-empty-hint">
                      Click on the plan to start adding items.
                    </div>
                  )}

                  {selectedPage && (
                    <button
                      className="add-to-dataset-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAddToDataset(countDef.trade, countDef.id)
                        setTimeout(refreshDatasetStats, 500)
                      }}
                    >
                      Add Page to Dataset
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {countDefinitions.length === 0 && (
          <div className="empty-counts">
            No count definitions yet.
            <br />
            Click <strong>+</strong> to create one.
          </div>
        )}
      </div>
          </div>
        )}
      </div>

      {/* ── Calibration Section ── */}
      {selectedPage && (
        <div className="section-wrapper">
          <ScaleControl
            scale={scale}
            onScaleChange={onScaleChange}
            pageId={selectedPage.id}
            pageDpi={selectedPage.dpi_x ?? selectedPage.dpi_y ?? undefined}
            isCalibrated={isCalibrated}
            isCalibrating={isCalibrating}
            onStartCalibration={onStartCalibration}
            onCancelCalibration={onCancelCalibration}
            calibrationPixelDist={calibrationPixelDist}
            onCalibrationSaved={onCalibrationSaved}
          />
        </div>
      )}

      {/* ── Context Menu ── */}
      {contextMenu && (() => {
        const multiSelected = selectedCountIds && selectedCountIds.size > 1 && selectedCountIds.has(contextMenu.countId)
        if (multiSelected) {
          return (
            <div
              ref={contextMenuRef}
              className="context-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <div
                className="context-menu-item danger"
                onClick={() => handleDeleteSelected()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete Selected ({selectedCountIds!.size})
              </div>
            </div>
          )
        }
        if (!countDefForContext) return null
        return (
          <div
            ref={contextMenuRef}
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div
              className="context-menu-item"
              onClick={() => handleSelectAllFromMenu()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Select All
            </div>
            <div
              className="context-menu-item"
              onClick={() => handleQuickEditName(countDefForContext)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Name
            </div>
            <div
              className="context-menu-item"
              onClick={() => handleEditFull(countDefForContext)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>
              Edit Color
            </div>
            {countDefForContext.count_type === 'each' && (
              <div
                className="context-menu-item"
                onClick={() => handleEditFull(countDefForContext)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><circle cx="17.5" cy="6.5" r="3.5"/><polygon points="12,16 17,22 22,16"/></svg>
                Edit Shape
              </div>
            )}
            <div
              className="context-menu-item"
              onClick={() => handleEditFull(countDefForContext)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              Edit Trade
            </div>
            <div className="context-menu-divider" />
            <div
              className="context-menu-item danger"
              onClick={() => handleDelete(contextMenu.countId)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete Count
            </div>
          </div>
        )
      })()}

      {/* ── Image Context Menu ── */}
      {imageContextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ left: imageContextMenu.x, top: imageContextMenu.y }}
        >
          <div
            className="context-menu-item"
            onClick={() => {
              void handleRenameExtraImage(imageContextMenu.id, imageContextMenu.name)
              setImageContextMenu(null)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit Name
          </div>
          <div className="context-menu-divider" />
          <div
            className="context-menu-item danger"
            onClick={() => {
              void handleDeleteExtraImage(imageContextMenu.id, imageContextMenu.name)
              setImageContextMenu(null)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete Image
          </div>
        </div>
      )}

      {/* ── Auto-Detect Section ── */}
      {selectedPage && (
        <div className="section-wrapper">
          <div className="section-header" onClick={() => setShowAutoDetect(!showAutoDetect)}>
            <div className="section-header-left">
              <h3 className="section-title">Auto-Detect</h3>
            </div>
            <div className="section-header-right">
              <span className="section-ai-icon" title="ML vision">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
                  <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
                </svg>
              </span>
              <button
                className="section-expand-btn"
              onClick={(e) => {
                e.stopPropagation()
                setShowAutoDetect(!showAutoDetect)
              }}
              title={showAutoDetect ? 'Collapse' : 'Expand'}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: showAutoDetect ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            </div>
          </div>

          {showAutoDetect && (
            <div className="section-body">
            <div className="auto-detect-panel">
              <div className="auto-detect-trades">
                <span className="auto-detect-label">Select trades to detect:</span>
                {TRADES.map((trade) => {
                  const isSelected = selectedTrades.has(trade.value)
                  const s = datasetStats[trade.value]
                  const globalCount = s?.global_items ?? 0
                  const accuracy = s?.estimated_accuracy ?? 0
                  return (
                    <label
                      key={trade.value}
                      className={`auto-detect-trade-row ${isSelected ? 'selected' : ''}`}
                      title={globalCount > 0
                        ? `${globalCount} training samples globally · ~${accuracy}% accuracy`
                        : 'No training data yet — annotate items on any page to grow the dataset'}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const next = new Set(selectedTrades)
                          if (next.has(trade.value)) next.delete(trade.value)
                          else next.add(trade.value)
                          setSelectedTrades(next)
                        }}
                      />
                      <span className="auto-detect-trade-dot" style={{ backgroundColor: trade.color }} />
                      <span className="auto-detect-trade-name">{trade.label}</span>
                      <span className={`auto-detect-trade-data ${globalCount === 0 ? 'auto-detect-trade-none' : ''}`}>
                        {globalCount > 0
                          ? `${globalCount} sample${globalCount !== 1 ? 's' : ''} · ${accuracy}%`
                          : 'no data'}
                      </span>
                    </label>
                  )
                })}
              </div>

              <button
                className="auto-detect-run-btn"
                onClick={async () => {
                  if (!selectedPage || selectedTrades.size === 0) return
                  setDetecting(true)
                  setDetectResult(null)
                  try {
                    const result = await runAutoDetect(selectedPage.id, Array.from(selectedTrades))
                    const count = result.count ?? result.items_created?.length ?? 0
                    setDetectResult({
                      count,
                      message: count > 0
                        ? `Found ${count} item${count !== 1 ? 's' : ''} using ML vision analysis. Review on canvas and delete any false positives.`
                        : 'No detections found. The ML model needs more training data. Annotate more pages across projects.',
                    })
                    if (onDetectionsReceived) {
                      onDetectionsReceived(result)
                    }
                    refreshDatasetStats()
                  } catch (err) {
                    setDetectResult({ count: 0, message: 'Detection failed: ' + (err as Error).message })
                  } finally {
                    setDetecting(false)
                  }
                }}
                disabled={detecting || selectedTrades.size === 0}
              >
                {detecting ? (
                  <>
                    <span className="auto-detect-spinner" /> Analysing floor plan...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    Run Auto-Detect
                  </>
                )}
              </button>

              {detectResult && (
                <div className={`auto-detect-result ${detectResult.count > 0 ? 'success' : 'empty'}`}>
                  {detectResult.message}
                </div>
              )}

              <div className="auto-detect-tip">
                ML vision analyses your floor plan using the global dataset.
                Existing detections stay until you re-run. More annotated
                pages = smarter, more accurate results.
              </div>
            </div>
            </div>
          )}
        </div>
      )}

      </div>

      {/* ── Modal ── */}
      {showModal && (
        <CountDefinitionModal
          planSetId={planSetId}
          countDefinition={editingCount}
          onClose={() => {
            setShowModal(false)
            setEditingCount(null)
          }}
          onSave={(def) => {
            if (editingCount) {
              onCountDefinitionUpdated(def)
            } else {
              onCountDefinitionCreated(def)
            }
            setShowModal(false)
            setEditingCount(null)
          }}
        />
      )}
    </aside>
  )
}
