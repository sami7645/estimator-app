import React from 'react'
import {
  MousePointer2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
  Undo2,
  Redo2,
  Hand,
  Eye,
  EyeOff,
  Download,
} from 'lucide-react'
import './Toolbar.css'

interface ToolbarProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
  onRotate: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  panMode: boolean
  countsVisible: boolean
  onSetPanMode: (enabled: boolean) => void
  onToggleCountsVisible: () => void
  onExportExcel: () => void
}


export default function Toolbar({
  onZoomIn,
  onZoomOut,
  onResetView,
  onRotate,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  panMode,
  countsVisible,
  onSetPanMode,
  onToggleCountsVisible,
  onExportExcel,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      {/* Select / pointer */}
      <button
        type="button"
        onClick={() => onSetPanMode(false)}
        className={`toolbar-btn ${!panMode ? 'active' : ''}`}
        title="Select / draw (default)"
        aria-label="Select tool"
      >
        <MousePointer2 className="toolbar-icon" />
      </button>

      {/* Zoom controls */}
      <button
        type="button"
        onClick={onZoomIn}
        className="toolbar-btn"
        title="Zoom in"
        aria-label="Zoom in"
      >
        <ZoomIn className="toolbar-icon" />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        className="toolbar-btn"
        title="Zoom out"
        aria-label="Zoom out"
      >
        <ZoomOut className="toolbar-icon" />
      </button>
      <button
        type="button"
        onClick={onResetView}
        className="toolbar-btn"
        title="Fit to view"
        aria-label="Fit to view"
      >
        <Maximize2 className="toolbar-icon" />
      </button>
      <button
        type="button"
        onClick={onRotate}
        className="toolbar-btn"
        title="Rotate 90°"
        aria-label="Rotate"
      >
        <RotateCw className="toolbar-icon" />
      </button>

      <div className="toolbar-separator" />

      {/* Undo/Redo */}
      <button
        type="button"
        onClick={onUndo}
        className="toolbar-btn"
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        <Undo2 className="toolbar-icon" />
      </button>
      <button
        type="button"
        onClick={onRedo}
        className="toolbar-btn"
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        aria-label="Redo"
      >
        <Redo2 className="toolbar-icon" />
      </button>

      <div className="toolbar-separator" />

      {/* Pan mode */}
      <button
        type="button"
        onClick={() => onSetPanMode(!panMode)}
        className={`toolbar-btn ${panMode ? 'active' : ''}`}
        title="Pan mode (Space + drag)"
        aria-label="Pan mode"
      >
        <Hand className="toolbar-icon" />
      </button>

      <div className="toolbar-separator" />

      {/* Toggle counts overlay */}
      <button
        type="button"
        onClick={onToggleCountsVisible}
        className={`toolbar-btn ${!countsVisible ? 'active' : ''}`}
        title={countsVisible ? 'Hide counts overlay' : 'Show counts overlay'}
        aria-label={countsVisible ? 'Hide counts overlay' : 'Show counts overlay'}
      >
        {countsVisible ? <Eye className="toolbar-icon" /> : <EyeOff className="toolbar-icon" />}
      </button>

      <div className="toolbar-separator" />

      {/* Export */}
      <button
        type="button"
        onClick={onExportExcel}
        className="toolbar-btn"
        title="Export counts to Excel"
        aria-label="Export counts to Excel"
      >
        <Download className="toolbar-icon" />
      </button>
    </div>
  )
}
