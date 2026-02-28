/**
 * Export plan set as PDF: all page images with count items (lines, polygons, squares, etc.) overlaid.
 */
import type { PlanPage, PlanSet, CountItem, CountDefinition } from '../api'
import { MEDIA_BASE } from '../api'

function denorm(nx: number, ny: number, width: number, height: number): [number, number] {
  return [nx * width, ny * height]
}

function drawCountItem(
  ctx: CanvasRenderingContext2D,
  item: CountItem,
  def: CountDefinition | undefined,
  width: number,
  height: number
) {
  const color = def?.color ?? '#2563eb'
  const fill = color + '40'
  const stroke = color
  const strokeWidth = Math.max(1.5, Math.min(width, height) * 0.002)

  const geom = item.geometry
  if (!geom || geom.length === 0) return

  if (item.geometry_type === 'point') {
    const [x, y] = denorm(geom[0][0], geom[0][1], width, height)
    const size = Math.min(width, height) * 0.02
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = strokeWidth
    ctx.beginPath()
    ctx.arc(x, y, size / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    return
  }

  if (item.geometry_type === 'rect' && geom.length >= 2) {
    const [x1, y1] = denorm(geom[0][0], geom[0][1], width, height)
    const [x2, y2] = denorm(geom[1][0], geom[1][1], width, height)
    const rx = Math.min(x1, x2)
    const ry = Math.min(y1, y2)
    const rw = Math.abs(x2 - x1)
    const rh = Math.abs(y2 - y1)
    const rotDeg = item.rotation_deg ?? 0
    ctx.save()
    ctx.translate((x1 + x2) / 2, (y1 + y2) / 2)
    ctx.rotate((rotDeg * Math.PI) / 180)
    ctx.translate(-(x1 + x2) / 2, -(y1 + y2) / 2)
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = strokeWidth
    ctx.fillRect(rx, ry, rw, rh)
    ctx.strokeRect(rx, ry, rw, rh)
    ctx.restore()
    return
  }

  if (item.geometry_type === 'circle' && geom.length >= 2) {
    const [x1, y1] = denorm(geom[0][0], geom[0][1], width, height)
    const [x2, y2] = denorm(geom[1][0], geom[1][1], width, height)
    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2
    const rx = Math.abs(x2 - x1) / 2
    const ry = Math.abs(y2 - y1) / 2
    const rotDeg = item.rotation_deg ?? 0
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((rotDeg * Math.PI) / 180)
    ctx.translate(-cx, -cy)
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = strokeWidth
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    return
  }

  if (item.geometry_type === 'triangle' && geom.length >= 2) {
    const [x1, y1] = denorm(geom[0][0], geom[0][1], width, height)
    const [x2, y2] = denorm(geom[1][0], geom[1][1], width, height)
    const midX = (x1 + x2) / 2
    const topY = Math.min(y1, y2)
    const pts = [
      [midX, topY],
      [Math.max(x1, x2), Math.max(y1, y2)],
      [Math.min(x1, x2), Math.max(y1, y2)],
    ]
    const rotDeg = item.rotation_deg ?? 0
    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((rotDeg * Math.PI) / 180)
    ctx.translate(-cx, -cy)
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = strokeWidth
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    pts.forEach(([px, py], i) => (i === 0 ? undefined : ctx.lineTo(px, py)))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    return
  }

  if (item.geometry_type === 'polyline' && geom.length >= 2) {
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = strokeWidth
    ctx.beginPath()
    const [x0, y0] = denorm(geom[0][0], geom[0][1], width, height)
    ctx.moveTo(x0, y0)
    for (let i = 1; i < geom.length; i++) {
      const [x, y] = denorm(geom[i][0], geom[i][1], width, height)
      ctx.lineTo(x, y)
    }
    ctx.stroke()
    return
  }

  if (item.geometry_type === 'polygon' && geom.length >= 2) {
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = strokeWidth
    ctx.beginPath()
    const [x0, y0] = denorm(geom[0][0], geom[0][1], width, height)
    ctx.moveTo(x0, y0)
    for (let i = 1; i < geom.length; i++) {
      const [x, y] = denorm(geom[i][0], geom[i][1], width, height)
      ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    return
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src.startsWith('http') ? src : `${MEDIA_BASE}/${src}`
  })
}

export type ExportPlanPdfOptions = {
  planSet: PlanSet
  pages: PlanPage[]
  countDefinitions: CountDefinition[]
  getCountItemsForPage: (pageId: number) => Promise<CountItem[]>
  onProgress?: (current: number, total: number) => void
}

export async function exportPlanAsPdf(options: ExportPlanPdfOptions): Promise<void> {
  const { planSet, pages, countDefinitions, getCountItemsForPage, onProgress } = options
  const { jsPDF } = await import('jspdf')

  const defMap = new Map(countDefinitions.map((d) => [d.id, d]))
  const sortedPages = [...pages].sort((a, b) => a.page_number - b.page_number)
  // We'll create the jsPDF instance after we know the first image size.
  // Each PDF page will be sized to the image aspect ratio with no margins,
  // and scaled to a reasonable physical size so viewers don't appear over‑zoomed.
  let doc: any = null

  for (let i = 0; i < sortedPages.length; i++) {
    onProgress?.(i + 1, sortedPages.length)
    const page = sortedPages[i]
    const imageUrl = page.image.startsWith('http') ? page.image : `${MEDIA_BASE}/${page.image}`

    const img = await loadImage(imageUrl)
    const imgW = img.naturalWidth
    const imgH = img.naturalHeight

    const items = await getCountItemsForPage(page.id)

    const canvas = document.createElement('canvas')
    canvas.width = imgW
    canvas.height = imgH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get canvas context')
    ctx.drawImage(img, 0, 0, imgW, imgH)

    for (const item of items) {
      const def = defMap.get(item.count_definition)
      drawCountItem(ctx, item, def, imgW, imgH)
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)

    // Choose a sane PDF width (in points) and scale height to keep aspect ratio.
    // This avoids gigantic pages that feel \"stuck\" zoomed‑in in viewers,
    // while still matching the image aspect and having no extra borders.
    const targetWidthPt = 800 // ~11 inches wide at 72dpi
    const scale = targetWidthPt / imgW
    const targetHeightPt = imgH * scale

    if (!doc) {
      doc = new jsPDF({
        orientation: targetWidthPt >= targetHeightPt ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [targetWidthPt, targetHeightPt],
      })
    } else {
      doc.addPage([targetWidthPt, targetHeightPt])
    }

    // Fill the page completely with the image (no margins).
    doc.addImage(dataUrl, 'JPEG', 0, 0, targetWidthPt, targetHeightPt)
  }

  const fileName = `${planSet.name.replace(/[^a-zA-Z0-9-_]/g, '_')}_with_detections.pdf`
  doc.save(fileName)
}
