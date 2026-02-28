import React, { useState, useEffect } from 'react'
import { saveScaleCalibration } from '../api'
import './ScaleControl.css'

/** Architectural scale: label shown on plans (e.g. "1/8\" = 1'-0\"") and factor: 1 drawing inch = factor feet */
const ARCH_SCALES = [
  { label: 'Manual (enter ft or in)', value: '', factor: 0 },
  { label: '1/8" = 1\'-0"', value: '1/8', factor: 8 },
  { label: '1/4" = 1\'-0"', value: '1/4', factor: 4 },
  { label: '1/2" = 1\'-0"', value: '1/2', factor: 2 },
  { label: '3/4" = 1\'-0"', value: '3/4', factor: 4 / 3 },
  { label: '1" = 1\'-0"', value: '1', factor: 1 },
  { label: '1" = 10\'', value: '1-10', factor: 10 },
  { label: '1" = 20\'', value: '1-20', factor: 20 },
  { label: '1" = 30\'', value: '1-30', factor: 30 },
  { label: '1" = 50\'', value: '1-50', factor: 50 },
]

interface ScaleControlProps {
  scale: { realWorldFeet: number; pixelDistance: number }
  onScaleChange: (scale: { realWorldFeet: number; pixelDistance: number }) => void
  pageId: number
  /** Effective rendering DPI for this page image (pixels per inch), if known. */
  pageDpi?: number
  isCalibrated: boolean
  isCalibrating: boolean
  onStartCalibration: () => void
  onCancelCalibration: () => void
  calibrationPixelDist: number | null
  onCalibrationSaved: () => void
}

export default function ScaleControl({
  scale,
  onScaleChange,
  pageId,
  pageDpi,
  isCalibrated,
  isCalibrating,
  onStartCalibration,
  onCancelCalibration,
  calibrationPixelDist,
  onCalibrationSaved,
}: ScaleControlProps) {
  const [distanceInput, setDistanceInput] = useState('')
  const [unit, setUnit] = useState<'ft' | 'in'>('ft')
  const [selectedArchScale, setSelectedArchScale] = useState('')
  const [saving, setSaving] = useState(false)
  const [isExpanded, setIsExpanded] = useState(!isCalibrated)
  const [calibrationMode, setCalibrationMode] = useState<'scale' | 'points'>('scale')
  const [showRecalibrate, setShowRecalibrate] = useState(false)

  // Reset input when new calibration line is drawn
  useEffect(() => {
    if (calibrationPixelDist != null) {
      setDistanceInput('')
      setUnit('ft')
    }
  }, [calibrationPixelDist])

  // When calibration is saved, hide recalibrate option and collapse if not expanded
  useEffect(() => {
    if (isCalibrated && !isCalibrating && calibrationPixelDist === null) {
      setShowRecalibrate(false)
      if (!isExpanded) setIsExpanded(false)
    }
  }, [isCalibrated, isCalibrating, calibrationPixelDist, isExpanded])

  // When user collapses, dismiss recalibrate
  useEffect(() => {
    if (!isExpanded && showRecalibrate) {
      setShowRecalibrate(false)
    }
  }, [isExpanded, showRecalibrate])

  const archScale = ARCH_SCALES.find((s) => s.value === selectedArchScale)
  const useDrawingInches = archScale && archScale.factor > 0
  // We always render pages with a fixed zoom (2x → 144 dpi). For older pages
  // that don't have dpi recorded, fall back to 144 so plan-scale-only
  // calibration still works.
  const effectiveDpi = pageDpi ?? 144

  async function handleSaveCalibration() {
    const raw = parseFloat(distanceInput)
    if (isNaN(raw) || raw <= 0) return

    let realFeet: number
    let pixelDist: number

    if (useDrawingInches && archScale) {
      // Drawing-based entry: user typed the distance between two points in drawing inches
      // for a known architectural scale (e.g. 1/8\" = 1'-0\"). Convert drawing inches
      // to real-world feet using the selected scale's factor.
      realFeet = raw * archScale.factor
      pixelDist = calibrationPixelDist!
    } else {
      // Manual ft / in calibration (no architectural scale selected)
      realFeet = unit === 'in' ? raw / 12 : raw
      pixelDist = calibrationPixelDist!
    }

    setSaving(true)
    try {
      await saveScaleCalibration({
        page: pageId,
        real_world_feet: realFeet,
        pixel_distance: pixelDist,
      })
      onScaleChange({ realWorldFeet: realFeet, pixelDistance: pixelDist })
      onCalibrationSaved()
      setShowRecalibrate(false)
      setIsExpanded(false)
    } catch (err) {
      console.error('Failed to save scale:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleApplyPlanScaleFromDpi() {
    if (!effectiveDpi) return
    const arch = ARCH_SCALES.find((s) => s.value === selectedArchScale)
    if (!arch || arch.factor <= 0) return

    // Architectural scale: 1 drawing inch = factor feet.
    // With known image DPI, 1 drawing inch = pageDpi pixels, so feet-per-pixel = factor / pageDpi.
    const realFeet = arch.factor
    const pixelDist = effectiveDpi

    setSaving(true)
    try {
      await saveScaleCalibration({
        page: pageId,
        real_world_feet: realFeet,
        pixel_distance: pixelDist,
      })
      onScaleChange({ realWorldFeet: realFeet, pixelDistance: pixelDist })
      onCalibrationSaved()
      setShowRecalibrate(false)
      setIsExpanded(false)
    } catch (err) {
      console.error('Failed to save scale from plan scale + DPI:', err)
    } finally {
      setSaving(false)
    }
  }

  const feetPerPixel = scale.realWorldFeet / scale.pixelDistance
  const displayScale = feetPerPixel < 0.01
    ? `1 px = ${(feetPerPixel * 12).toFixed(3)} in`
    : `1 px = ${feetPerPixel.toFixed(4)} ft`

  // Calibration line drawn → show distance input (keep expanded)
  if (calibrationPixelDist != null) {
    return (
      <div className="scale-control">
        <div className="scale-control-header">
          <div className="scale-control-header-left">
            <h3 className="scale-control-title">Calibration</h3>
          </div>
          <span className="scale-status-icon uncalibrated" title="Calibrating">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </span>
        </div>
        <div className="scale-control-body">
          <div className="scale-cal-measured">
            Measured: <strong>{calibrationPixelDist.toFixed(1)} px</strong>
          </div>
          <label className="scale-cal-label">Plan scale (from drawing if shown)</label>
          <select
            className="scale-cal-arch-select"
            value={selectedArchScale}
            onChange={(e) => setSelectedArchScale(e.target.value)}
          >
            {ARCH_SCALES.map((s) => (
              <option key={s.value || 'none'} value={s.value}>{s.label}</option>
            ))}
          </select>
          <label className="scale-cal-label">
            {useDrawingInches ? 'Length between the two points (drawing inches)' : 'Real-world distance'}
          </label>
          <div className="scale-cal-input-row">
            <input
              type="number"
              className="scale-cal-input"
              value={distanceInput}
              onChange={(e) => setDistanceInput(e.target.value)}
              placeholder={useDrawingInches ? 'e.g. 1 or 2.5' : 'e.g. 10'}
              min="0.01"
              step="any"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSaveCalibration()
                if (e.key === 'Escape') onCancelCalibration()
              }}
            />
            {!useDrawingInches && (
              <select
                className="scale-cal-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'ft' | 'in')}
              >
                <option value="ft">ft</option>
                <option value="in">in</option>
              </select>
            )}
            {useDrawingInches && <span className="scale-cal-unit-static">in</span>}
          </div>
          <div className="scale-cal-actions">
            <button
              className="scale-cal-save"
              onClick={handleSaveCalibration}
              disabled={saving || !distanceInput || parseFloat(distanceInput) <= 0}
            >
              {saving ? 'Saving...' : 'Save Scale'}
            </button>
            <button className="scale-cal-cancel" onClick={onCancelCalibration}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Actively calibrating → show instructions (keep expanded)
  if (isCalibrating) {
    return (
      <div className="scale-control">
        <div className="scale-control-header">
          <div className="scale-control-header-left">
            <h3 className="scale-control-title">Calibration</h3>
          </div>
          <span className="scale-status-icon uncalibrated" title="Calibrating">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </span>
        </div>
        <div className="scale-control-body">
          <p className="scale-cal-instruction">
            Click <strong>two points</strong> on a known dimension on the plan (e.g. a wall with a measurement label).
          </p>
          <button className="scale-cal-cancel wide" onClick={onCancelCalibration}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Default: show collapsible calibration section
  return (
    <div className="scale-control">
      <div className="scale-control-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="scale-control-header-left">
          <h3 className="scale-control-title">Calibration</h3>
        </div>
        <div className="scale-control-header-right">
          <span
            className={`scale-status-icon ${isCalibrated ? 'calibrated' : 'uncalibrated'}`}
            title={isCalibrated ? 'Calibrated' : 'Not calibrated'}
          >
            {isCalibrated ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            )}
          </span>
          <button
            type="button"
            className="scale-control-expand-btn"
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(!isExpanded)
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="scale-control-body">
          {!isCalibrated && (
            <p className="scale-status-inline uncalibrated">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Not calibrated
            </p>
          )}
          {isCalibrated && !showRecalibrate && (
            <div className="scale-calibrated-display">
              <div className="scale-calibrated-value">{displayScale}</div>
              <button
                type="button"
                className="scale-recalibrate-btn"
                onClick={() => {
                  setShowRecalibrate(true)
                  setCalibrationMode('points')
                }}
              >
                Recalibrate
              </button>
            </div>
          )}

          {(showRecalibrate || !isCalibrated) && (
            <>
              <div className="scale-mode-capsule">
                <button
                  type="button"
                  className={`scale-mode-option ${calibrationMode === 'scale' ? 'active' : ''}`}
                  onClick={() => setCalibrationMode('scale')}
                >
                  Scale-based
                </button>
                <button
                  type="button"
                  className={`scale-mode-option ${calibrationMode === 'points' ? 'active' : ''}`}
                  onClick={() => setCalibrationMode('points')}
                >
                  Points-based
                </button>
              </div>

              {calibrationMode === 'scale' ? (
                <div className="scale-mode-content">
                  <label className="scale-select-label">Plan scale</label>
                  <select
                    className="scale-select"
                    value={selectedArchScale}
                    onChange={(e) => setSelectedArchScale(e.target.value)}
                  >
                    {ARCH_SCALES.map((s) => (
                      <option key={s.value || 'none'} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {archScale && archScale.factor > 0 && (
                    <button
                      type="button"
                      className="scale-set-btn"
                      onClick={() => void handleApplyPlanScaleFromDpi()}
                      disabled={saving}
                    >
                      Set Scale
                    </button>
                  )}
                </div>
              ) : (
                <div className="scale-mode-content">
                  <p className="scale-instruction-text">
                    Click <strong>two points</strong> on a known dimension on the plan (e.g. a wall with a measurement label).
                  </p>
                  <button
                    type="button"
                    className="scale-set-btn"
                    onClick={() => {
                      onStartCalibration()
                      setShowRecalibrate(false)
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0z"/><line x1="14" y1="4" x2="20" y2="10"/><line x1="2" y1="22" x2="8" y2="16"/></svg>
                    Calibrate
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
