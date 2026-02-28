import React, { useState, useEffect } from 'react'
import type { CountDefinition } from '../api'
import { createCountDefinition, updateCountDefinition } from '../api'
import './CountDefinitionModal.css'

const PRIME_COLORS = [
  '#00ff00', '#ff0000', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
  '#ff8800', '#8800ff', '#0088ff', '#ff0088', '#88ff00', '#00ff88',
]

interface CountDefinitionModalProps {
  planSetId: number
  countDefinition: CountDefinition | null
  onClose: () => void
  onSave: (def: CountDefinition) => void
}

export default function CountDefinitionModal({
  planSetId,
  countDefinition,
  onClose,
  onSave,
}: CountDefinitionModalProps) {
  const [name, setName] = useState(countDefinition?.name || '')
  const [countType, setCountType] = useState<'area_perimeter' | 'linear_feet' | 'each'>(
    countDefinition?.count_type || 'each'
  )
  const [color, setColor] = useState(countDefinition?.color || '#00ff00')
  const [shape, setShape] = useState<'square' | 'circle' | 'triangle'>(
    (countDefinition?.shape as any) || 'square'
  )
  const [trade, setTrade] = useState(countDefinition?.trade || 'acoustic')
  const [customColor, setCustomColor] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      alert('Please enter a name')
      return
    }

    try {
      const data: Partial<CountDefinition> = {
        plan_set: planSetId,
        name: name.trim(),
        count_type: countType,
        color: customColor || color,
        trade,
      }
      if (countType === 'each') {
        data.shape = shape
      }

      let result: CountDefinition
      if (countDefinition) {
        result = await updateCountDefinition(countDefinition.id, data)
      } else {
        result = await createCountDefinition(data)
      }
      onSave(result)
    } catch (err) {
      alert('Failed to save: ' + (err as Error).message)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content count-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{countDefinition ? 'Edit' : 'Create'} Count Definition</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g., Light Fixtures"
            />
          </div>

          <div className="form-group">
            <label>Count Type</label>
            <select value={countType} onChange={(e) => setCountType(e.target.value as any)}>
              <option value="each">Each</option>
              <option value="linear_feet">Linear Feet</option>
              <option value="area_perimeter">Area & Perimeter</option>
            </select>
          </div>

          <div className="form-group">
            <label>Trade</label>
            <select value={trade} onChange={(e) => setTrade(e.target.value)}>
              <option value="acoustic">Acoustic</option>
              <option value="electrical">Electrical</option>
              <option value="plumbing">Plumbing</option>
              <option value="mechanical">Mechanical</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label>Color</label>
            <div className="color-picker">
              <div className="prime-colors">
                {PRIME_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-swatch ${color === c ? 'selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => {
                      setColor(c)
                      setCustomColor('')
                    }}
                  />
                ))}
              </div>
              <div className="custom-color">
                <input
                  type="color"
                  value={customColor || color}
                  onChange={(e) => {
                    setCustomColor(e.target.value)
                    setColor(e.target.value)
                  }}
                />
                <span>Custom</span>
              </div>
            </div>
          </div>

          {countType === 'each' && (
            <div className="form-group">
              <label>Shape</label>
              <div className="shape-selector">
                <button
                  type="button"
                  className={`shape-btn ${shape === 'square' ? 'active' : ''}`}
                  onClick={() => setShape('square')}
                >
                  ▢ Square
                </button>
                <button
                  type="button"
                  className={`shape-btn ${shape === 'circle' ? 'active' : ''}`}
                  onClick={() => setShape('circle')}
                >
                  ○ Circle
                </button>
                <button
                  type="button"
                  className={`shape-btn ${shape === 'triangle' ? 'active' : ''}`}
                  onClick={() => setShape('triangle')}
                >
                  △ Triangle
                </button>
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {countDefinition ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
