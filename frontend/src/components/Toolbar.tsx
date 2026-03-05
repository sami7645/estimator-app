import React, { useState, useRef, useEffect } from 'react'
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
  StickyNote,
} from 'lucide-react'
import './Toolbar.css'

const NOTE_COLORS = [
  '#fef08a', '#fed7aa', '#fca5a5', '#d9f99d',
  '#a5f3fc', '#c4b5fd', '#fbcfe8', '#e5e7eb',
]

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

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
  noteMode: boolean
  noteColor: string
  onSetNoteMode: (enabled: boolean) => void
  onNoteColorChange: (color: string) => void
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
  noteMode,
  noteColor,
  onSetNoteMode,
  onNoteColorChange,
}: ToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showColorPicker) return
    function handleClick(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showColorPicker])

  return (
    <div className="toolbar">
      {/* Select / pointer */}
      <button
        type="button"
        onClick={() => { onSetPanMode(false); onSetNoteMode(false) }}
        className={`toolbar-btn ${!panMode && !noteMode ? 'active' : ''}`}
        title="Select / draw (default)"
        aria-label="Select tool"
      >
        <MousePointer2 className="toolbar-icon" />
      </button>

      {/* Zoom controls */}
      <button type="button" onClick={onZoomIn} className="toolbar-btn" title="Zoom in" aria-label="Zoom in">
        <ZoomIn className="toolbar-icon" />
      </button>
      <button type="button" onClick={onZoomOut} className="toolbar-btn" title="Zoom out" aria-label="Zoom out">
        <ZoomOut className="toolbar-icon" />
      </button>
      <button type="button" onClick={onResetView} className="toolbar-btn" title="Fit to view" aria-label="Fit to view">
        <Maximize2 className="toolbar-icon" />
      </button>
      <button type="button" onClick={onRotate} className="toolbar-btn" title="Rotate 90°" aria-label="Rotate">
        <RotateCw className="toolbar-icon" />
      </button>

      <div className="toolbar-separator" />

      {/* Undo/Redo */}
      <button type="button" onClick={onUndo} className="toolbar-btn" disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
        <Undo2 className="toolbar-icon" />
      </button>
      <button type="button" onClick={onRedo} className="toolbar-btn" disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
        <Redo2 className="toolbar-icon" />
      </button>

      <div className="toolbar-separator" />

      {/* Pan mode */}
      <button
        type="button"
        onClick={() => { onSetPanMode(!panMode); if (!panMode) onSetNoteMode(false) }}
        className={`toolbar-btn ${panMode ? 'active' : ''}`}
        title="Pan mode (Ctrl + drag)"
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

      {/* Note tool */}
      <div className="toolbar-note-wrap" ref={colorPickerRef}>
        <button
          type="button"
          onClick={() => { onSetNoteMode(!noteMode); if (!noteMode) onSetPanMode(false) }}
          className={`toolbar-btn ${noteMode ? 'active' : ''}`}
          title="Add note (Ctrl+T)"
          aria-label="Add note"
        >
          <StickyNote className="toolbar-icon" />
        </button>
        <button
          type="button"
          className="toolbar-note-color-btn"
          style={{ backgroundColor: noteColor }}
          onClick={() => setShowColorPicker(!showColorPicker)}
          title="Choose note color"
          aria-label="Choose note color"
        />
        {showColorPicker && (
          <div className="toolbar-note-color-picker">
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`toolbar-note-color-swatch ${noteColor === c ? 'active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => { onNoteColorChange(c); setShowColorPicker(false) }}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
