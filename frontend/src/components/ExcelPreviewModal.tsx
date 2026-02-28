import React, { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import * as XLSXStyle from 'xlsx-js-style'
import { X, Download, Pencil, Undo2, Redo2, Bold } from 'lucide-react'
import './ExcelPreviewModal.css'

type SheetData = { name: string; data: (string | number)[][] }
type CellStyle = { bold?: boolean; color?: string }

interface ExcelPreviewModalProps {
  planSetId: number
  onClose: () => void
  exportCountsExcel: (planSetId?: number) => Promise<Blob>
}

function sheetToMatrix(ws: XLSX.WorkSheet): (string | number)[][] {
  const ref = ws['!ref']
  if (!ref) return []
  const range = XLSX.utils.decode_range(ref)
  const out: (string | number)[][] = []
  for (let R = range.s.r; R <= range.e.r; R++) {
    const row: (string | number)[] = []
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[addr]
      const val = cell?.v !== undefined ? cell.v : ''
      row.push(typeof val === 'number' ? val : String(val))
    }
    out.push(row)
  }
  return out
}

function matrixToSheetWithStyle(data: (string | number)[][], styleMap?: CellStyle[][]) {
  // Use a loose worksheet type here to avoid fighting the deeply nested
  // xlsx-js-style typings – at runtime this is just a plain object map.
  const ws: any = {}
  if (data.length === 0) {
    ws['!ref'] = 'A1'
    return ws
  }
  let maxC = 0
  data.forEach((row, r) => {
    if (row.length > maxC) maxC = row.length
    row.forEach((val, c) => {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell: XLSX.CellObject & { s?: { font?: { bold?: boolean; color?: { rgb: string } } } } = {
        t: typeof val === 'number' ? 'n' : 's',
        v: val,
      }
      const s = styleMap?.[r]?.[c]
      if (s && (s.bold || s.color)) {
        cell.s = {
          font: {
            ...(s.bold && { bold: true }),
            ...(s.color && { color: { rgb: s.color.replace(/^#/, '').toUpperCase().slice(0, 8) } }),
          },
        }
      }
      ws[addr] = cell
    })
  })
  const range = { s: { r: 0, c: 0 }, e: { r: data.length - 1, c: Math.max(0, maxC - 1) } }
  ws['!ref'] = XLSX.utils.encode_range(range)
  return ws
}

export default function ExcelPreviewModal({ planSetId, onClose, exportCountsExcel }: ExcelPreviewModalProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sheets, setSheets] = useState<SheetData[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [undoStack, setUndoStack] = useState<SheetData[][]>([])
  const [redoStack, setRedoStack] = useState<SheetData[][]>([])
  const [cellStyles, setCellStyles] = useState<Record<string, CellStyle[][]>>({})
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const selectAnchorRef = useRef<{ r: number; c: number } | null>(null)
  const isSelectingRef = useRef(false)
  const savedSelectionRef = useRef<{ range: Range; sel: Selection } | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  const sheetsRef = useRef<SheetData[]>([])
  const activeIndexRef = useRef(0)
  useEffect(() => {
    sheetsRef.current = sheets
  }, [sheets])
  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  const pushUndo = useCallback((snapshot: SheetData[]) => {
    setUndoStack((u) => [...u.slice(-99), snapshot.map((s) => ({ name: s.name, data: s.data.map((r) => [...r]) }))])
    setRedoStack([])
  }, [])

  const undo = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u
      const prev = u[u.length - 1]
      setRedoStack((r) => [...r, sheetsRef.current.map((s) => ({ name: s.name, data: s.data.map((row) => [...row]) }))])
      setSheets(prev.map((s) => ({ name: s.name, data: s.data.map((row) => [...row]) })))
      return u.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r
      const next = r[r.length - 1]
      setUndoStack((u) => [...u, sheetsRef.current.map((s) => ({ name: s.name, data: s.data.map((row) => [...row]) }))])
      setSheets(next.map((s) => ({ name: s.name, data: s.data.map((row) => [...row]) })))
      return r.slice(0, -1)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    exportCountsExcel(planSetId)
      .then((blob) => {
        if (cancelled) return
        return blob.arrayBuffer()
      })
      .then((buf) => {
        if (cancelled || !buf) return
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
        const list: SheetData[] = wb.SheetNames.map((name) => ({
          name,
          data: sheetToMatrix(wb.Sheets[name]),
        }))
        setSheets(list)
        setActiveIndex(0)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load Excel')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [planSetId, exportCountsExcel])

  useEffect(() => {
    if (!editMode) return
    const onMouseUp = () => {
      isSelectingRef.current = false
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [editMode])

  useEffect(() => {
    if (!editMode) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement
        if (target.closest('.excel-preview-table')) {
          const cellsToClear = selectedCells.size > 0 ? selectedCells : (() => {
            const focused = document.querySelector('.excel-cell:focus') as HTMLElement | null
            if (!focused) return new Set<string>()
            const r = focused.getAttribute('data-row')
            const c = focused.getAttribute('data-col')
            return r != null && c != null ? new Set([`${r},${c}`]) : new Set<string>()
          })()
          if (cellsToClear.size > 0) {
            e.preventDefault()
            e.stopPropagation()
            clearSelectedCells(cellsToClear)
            setSelectedCells(new Set())
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [editMode, undo, redo, selectedCells])

  const handleCellChange = useCallback(
    (sheetIndex: number, rowIndex: number, colIndex: number, value: string) => {
      setSheets((prev) => {
        const next = prev.map((s) => ({ name: s.name, data: s.data.map((r) => [...r]) }))
        const sheet = next[sheetIndex]
        if (!sheet) return prev
        while (sheet.data.length <= rowIndex) sheet.data.push([])
        const row = sheet.data[rowIndex]
        while (row.length <= colIndex) row.push('')
        row[colIndex] = value
        pushUndo(prev)
        return next
      })
    },
    [pushUndo]
  )

  const getCellStyle = useCallback(
    (sheetName: string, r: number, c: number): CellStyle => {
      return cellStyles[sheetName]?.[r]?.[c] || {}
    },
    [cellStyles]
  )

  const setCellStyle = useCallback((sheetName: string, r: number, c: number, style: CellStyle) => {
    setCellStyles((prev) => {
      const next = { ...prev }
      if (!next[sheetName]) next[sheetName] = []
      if (!next[sheetName][r]) next[sheetName][r] = []
      next[sheetName][r][c] = { ...next[sheetName][r]?.[c], ...style }
      return next
    })
  }, [])

  const clearSelectedCells = useCallback((cellKeys: Set<string>) => {
    if (cellKeys.size === 0) return
    const sheetIndex = activeIndexRef.current
    setSheets((prev) => {
      const next = prev.map((s) => ({ name: s.name, data: s.data.map((r) => [...r]) }))
      const sheet = next[sheetIndex]
      if (!sheet) return prev
      pushUndo(prev)
      cellKeys.forEach((key) => {
        const [r, c] = key.split(',').map(Number)
        if (sheet.data[r]) {
          while (sheet.data[r].length <= c) sheet.data[r].push('')
          sheet.data[r][c] = ''
        }
      })
      return next
    })
  }, [pushUndo])

  const download = useCallback(() => {
    const mergedStyles: Record<string, CellStyle[][]> = {}
    sheets.forEach((s) => {
      mergedStyles[s.name] = (cellStyles[s.name] ?? []).map((row) => [...(row ?? [])])
    })
    const activeSheet = sheets[activeIndexRef.current]
    if (activeSheet && tableRef.current) {
      const table = tableRef.current.querySelector('.excel-preview-table')
      table?.querySelectorAll('.excel-cell').forEach((el) => {
        const r = parseInt((el as HTMLElement).getAttribute('data-row') ?? '', 10)
        const c = parseInt((el as HTMLElement).getAttribute('data-col') ?? '', 10)
        if (isNaN(r) || isNaN(c)) return
        const comp = window.getComputedStyle(el as Element)
        const bold = comp.fontWeight === 'bold' || parseInt(comp.fontWeight, 10) >= 600
        const m = comp.color?.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
        const rgb = m ? '#' + [m[1], m[2], m[3]].map((x) => parseInt(x, 10).toString(16).padStart(2, '0')).join('') : undefined
        if (!mergedStyles[activeSheet.name][r]) mergedStyles[activeSheet.name][r] = []
        mergedStyles[activeSheet.name][r][c] = { ...mergedStyles[activeSheet.name][r]?.[c], bold: bold || undefined, color: rgb }
      })
    }
    const wb = XLSXStyle.utils.book_new()
    const idx = activeIndexRef.current
    const sheet = sheets[idx]
    const targetSheets = sheet ? [sheet] : sheets

    targetSheets.forEach((s) => {
      const styles = mergedStyles[s.name]
      const ws = matrixToSheetWithStyle(s.data, styles)
      XLSXStyle.utils.book_append_sheet(wb, ws, s.name)
    })
    const out = XLSXStyle.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const sheetName = sheet ? sheet.name.replace(/[^a-z0-9]/gi, '_') : 'counts'
    a.download = `${sheetName}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }, [sheets, cellStyles])

  if (loading) {
    return (
      <div className="excel-modal-overlay" onClick={onClose}>
        <div className="excel-modal" onClick={(e) => e.stopPropagation()}>
          <div className="excel-modal-loading">Loading Excel…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="excel-modal-overlay" onClick={onClose}>
        <div className="excel-modal excel-modal-error" onClick={(e) => e.stopPropagation()}>
          <p>{error}</p>
          <button type="button" className="excel-modal-btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
    )
  }

  const active = sheets[activeIndex]
  const grid = active?.data || []

  return (
    <div className="excel-modal-overlay" onClick={onClose}>
      <div className="excel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="excel-modal-header">
          <h3 className="excel-modal-title">Export: Counts</h3>
          <div className="excel-modal-actions">
            {editMode && (
              <>
                <button
                  type="button"
                  className="excel-modal-icon-btn"
                  onClick={undo}
                  disabled={undoStack.length === 0}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 size={18} />
                </button>
                <button
                  type="button"
                  className="excel-modal-icon-btn"
                  onClick={redo}
                  disabled={redoStack.length === 0}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 size={18} />
                </button>
                <span className="excel-modal-divider" />
                <button
                  type="button"
                  className="excel-modal-icon-btn"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (active && selectedCells.size > 0) {
                      const anyBold = [...selectedCells].some((key) => {
                        const [r, c] = key.split(',').map(Number)
                        return getCellStyle(active.name, r, c).bold
                      })
                      setCellStyles((prev) => {
                        const sheet = prev[active.name] ?? []
                        const nextSheet = sheet.map((row) => (row ? [...row] : []))
                        selectedCells.forEach((key) => {
                          const [r, c] = key.split(',').map(Number)
                          while (nextSheet.length <= r) nextSheet.push([])
                          while (nextSheet[r].length <= c) nextSheet[r].push({})
                          const cur = nextSheet[r][c] || {}
                          nextSheet[r][c] = { ...cur, bold: !anyBold }
                        })
                        return { ...prev, [active.name]: nextSheet }
                      })
                    } else {
                      document.execCommand('bold', false)
                    }
                  }}
                  title="Bold (selection or cell)"
                >
                  <Bold size={18} />
                </button>
                <input
                  type="color"
                  className="excel-modal-color-input"
                  title="Text color"
                  defaultValue="#000000"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (active && selectedCells.size > 0) {
                      savedSelectionRef.current = null
                    } else {
                      const sel = document.getSelection()
                      if (sel && sel.rangeCount > 0) savedSelectionRef.current = { range: sel.getRangeAt(0).cloneRange(), sel }
                    }
                  }}
                  onChange={(e) => {
                    const color = e.target.value
                    if (active && selectedCells.size > 0) {
                      setCellStyles((prev) => {
                        const sheet = prev[active.name] ?? []
                        const nextSheet = sheet.map((row) => (row ? [...row] : []))
                        selectedCells.forEach((key) => {
                          const [r, c] = key.split(',').map(Number)
                          while (nextSheet.length <= r) nextSheet.push([])
                          while (nextSheet[r].length <= c) nextSheet[r].push({})
                          const cur = nextSheet[r][c] || {}
                          nextSheet[r][c] = { ...cur, color }
                        })
                        return { ...prev, [active.name]: nextSheet }
                      })
                    } else {
                      const saved = savedSelectionRef.current
                      if (saved?.sel && saved.range) {
                        saved.sel.removeAllRanges()
                        saved.sel.addRange(saved.range)
                      }
                      document.execCommand('foreColor', false, color)
                    }
                  }}
                />
                <span className="excel-modal-divider" />
              </>
            )}
            <button
              type="button"
              className={`excel-modal-btn ${editMode ? 'secondary' : 'primary'}`}
              onClick={() => setEditMode(!editMode)}
              title={editMode ? 'Exit edit mode' : 'Edit spreadsheet'}
            >
              <Pencil size={16} />
              {editMode ? ' Done' : ' Edit'}
            </button>
            <button type="button" className="excel-modal-btn primary" onClick={download}>
              <Download size={16} />
              Download
            </button>
          </div>
          <button type="button" className="excel-modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="excel-modal-tabs">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              className={`excel-modal-tab ${i === activeIndex ? 'active' : ''}`}
              onClick={() => setActiveIndex(i)}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="excel-modal-body" ref={tableRef}>
          <div className="excel-table-wrap">
            <table className="excel-preview-table">
              <tbody>
                {grid.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => {
                      const style = getCellStyle(active?.name ?? '', ri, ci)
                      const key = `${ri},${ci}`
                      const isSelected = selectedCells.has(key)
                      return (
                        <td
                          key={ci}
                          className={`excel-cell ${isSelected ? 'excel-cell-selected' : ''}`}
                          contentEditable={editMode}
                          suppressContentEditableWarning
                          data-row={ri}
                          data-col={ci}
                          style={{
                            fontWeight: style.bold ? 'bold' : undefined,
                            color: style.color || undefined,
                          }}
                          onMouseDown={(e) => {
                            if (!editMode) return
                            if (e.button !== 0) return
                            selectAnchorRef.current = { r: ri, c: ci }
                            isSelectingRef.current = true
                            setSelectedCells(new Set([key]))
                          }}
                          onMouseEnter={() => {
                            if (!editMode || !isSelectingRef.current || !selectAnchorRef.current) return
                            const a = selectAnchorRef.current
                            const minR = Math.min(a.r, ri)
                            const maxR = Math.max(a.r, ri)
                            const minC = Math.min(a.c, ci)
                            const maxC = Math.max(a.c, ci)
                            const set = new Set<string>()
                            for (let r = minR; r <= maxR; r++) {
                              for (let c = minC; c <= maxC; c++) set.add(`${r},${c}`)
                            }
                            setSelectedCells(set)
                          }}
                          onBlur={(e) => {
                            if (!editMode) return
                            const el = e.currentTarget
                            const val = el.textContent ?? ''
                            const current = grid[ri]?.[ci]
                            if (String(current) !== val) handleCellChange(activeIndex, ri, ci, val)
                            const comp = window.getComputedStyle(el)
                            const bold = comp.fontWeight === 'bold' || parseInt(comp.fontWeight, 10) >= 600
                            const color = comp.color ? comp.color : undefined
                            const rgb = color ? (() => {
                              const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
                              if (m) return '#' + [m[1], m[2], m[3]].map((x) => parseInt(x, 10).toString(16).padStart(2, '0')).join('')
                              return undefined
                            })() : undefined
                            if (active && (bold || rgb)) setCellStyle(active.name, ri, ci, { bold: bold || undefined, color: rgb })
                          }}
                        >
                          {cell !== undefined && cell !== null ? String(cell) : ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
