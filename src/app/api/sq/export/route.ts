import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

const INK   = 'FF1C1917'
const PAPER = 'FFFDFAF5'
const WARM  = 'FFF4F0E6'
const MUTED = 'FF6B6760'
const DARK  = 'FF3D3028'

const SCORE_COLORS: Record<string, { bg: string; fg: string }> = {
  high:   { bg: INK,   fg: PAPER },
  midhi:  { bg: DARK,  fg: PAPER },
  mid:    { bg: WARM,  fg: INK   },
  low:    { bg: PAPER, fg: MUTED },
}

function scoreStyle(score: number | null): { bg: string; fg: string } {
  if (score === null) return SCORE_COLORS.low
  if (score >= 75) return SCORE_COLORS.high
  if (score >= 55) return SCORE_COLORS.midhi
  if (score >= 35) return SCORE_COLORS.mid
  return SCORE_COLORS.low
}

function fillSolid(color: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
}

export async function POST(req: NextRequest) {
  const { places, neighborhood, category } = await req.json()
  const prospects = (places as any[]).filter(p => p.classification === 'PROSPECT')

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Studio Quartier'
  wb.created = new Date()

  const ws = wb.addWorksheet('Prospects', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
    views: [{ state: 'frozen', ySplit: 5 }],
  })

  const COL_COUNT = 13

  // ── Row 1: Brand title ───────────────────────────────────────────────────
  ws.addRow(['STUDIO QUARTIER', ...Array(COL_COUNT - 1).fill('')])
  ws.mergeCells(1, 1, 1, COL_COUNT)
  ws.getRow(1).height = 32
  for (let c = 1; c <= COL_COUNT; c++) {
    const cell = ws.getRow(1).getCell(c)
    cell.fill = fillSolid(INK)
    cell.font = { name: 'Arial', size: c === 1 ? 14 : 9, bold: c === 1, color: { argb: PAPER } }
    if (c === 1) cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 }
  }

  // ── Row 2: Subtitle ──────────────────────────────────────────────────────
  ws.addRow([`Rapport de Prospection · ${neighborhood} · ${category}`, ...Array(COL_COUNT - 1).fill('')])
  ws.mergeCells(2, 1, 2, COL_COUNT)
  ws.getRow(2).height = 22
  for (let c = 1; c <= COL_COUNT; c++) {
    const cell = ws.getRow(2).getCell(c)
    cell.fill = fillSolid(WARM)
    cell.font = { name: 'Arial', size: 10, color: { argb: MUTED } }
    if (c === 1) cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 }
  }

  // ── Row 3: Date ──────────────────────────────────────────────────────────
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  ws.addRow([`Généré le ${dateStr} · ${prospects.length} prospect${prospects.length !== 1 ? 's' : ''}`, ...Array(COL_COUNT - 1).fill('')])
  ws.mergeCells(3, 1, 3, COL_COUNT)
  ws.getRow(3).height = 18
  for (let c = 1; c <= COL_COUNT; c++) {
    const cell = ws.getRow(3).getCell(c)
    cell.fill = fillSolid(WARM)
    cell.font = { name: 'Arial', size: 9, color: { argb: MUTED } }
    if (c === 1) cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 }
  }

  // ── Row 4: Empty spacer ──────────────────────────────────────────────────
  ws.addRow(Array(COL_COUNT).fill(''))
  ws.getRow(4).height = 10
  for (let c = 1; c <= COL_COUNT; c++) {
    ws.getRow(4).getCell(c).fill = fillSolid(WARM)
  }

  // ── Row 5: Headers ───────────────────────────────────────────────────────
  const HEADERS = ['N°', 'Établissement', 'Score', 'Adresse', 'Note ★', 'Avis', 'Site web', 'Instagram', 'Qualité site', 'Services recommandés', 'Analyse IA', 'Téléphone', 'Google Maps']
  const headerRow = ws.addRow(HEADERS)
  headerRow.height = 24
  headerRow.eachCell(cell => {
    cell.fill  = fillSolid(INK)
    cell.font  = { name: 'Arial', size: 9, bold: true, color: { argb: PAPER } }
    cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  })

  // ── Rows 6+: Data ────────────────────────────────────────────────────────
  prospects.forEach((p: any, i: number) => {
    const bg = i % 2 === 0 ? PAPER : WARM
    const row = ws.addRow([
      i + 1,
      p.name ?? '',
      p.score ?? '',
      p.address ?? '',
      p.rating ?? '',
      p.review_count ?? 0,
      p.website ?? '—',
      p.instagram_url ?? (p.has_instagram ? 'Oui' : '—'),
      p.website_quality ?? '—',
      Array.isArray(p.services) ? p.services.join(', ') : '—',
      p.summary ?? '—',
      p.phone ?? '—',
      p.maps_url ?? '',
    ])
    row.height = 20
    row.eachCell(cell => {
      cell.fill      = fillSolid(bg)
      cell.font      = { name: 'Arial', size: 11, color: { argb: INK } }
      cell.alignment = { vertical: 'top', wrapText: false }
    })

    // Score cell — colored by tier
    if (p.score !== null && p.score !== undefined) {
      const scoreCell  = row.getCell(3)
      const { bg: sbg, fg: sfg } = scoreStyle(p.score)
      scoreCell.fill      = fillSolid(sbg)
      scoreCell.font      = { name: 'Arial', size: 11, bold: true, color: { argb: sfg } }
      scoreCell.alignment = { horizontal: 'center', vertical: 'middle' }
    }

    // Website URL
    if (p.website) {
      const wCell = row.getCell(7)
      wCell.value = { text: 'Voir →', hyperlink: p.website }
      wCell.font  = { name: 'Arial', size: 11, color: { argb: INK }, underline: true }
    }

    // Maps URL
    if (p.maps_url) {
      const mCell = row.getCell(13)
      mCell.value = { text: 'Maps ↗', hyperlink: p.maps_url }
      mCell.font  = { name: 'Arial', size: 11, color: { argb: INK }, underline: true }
    }
  })

  // ── Column widths ────────────────────────────────────────────────────────
  ws.columns = [
    { width: 5 }, { width: 28 }, { width: 8 }, { width: 36 },
    { width: 7 }, { width: 8 }, { width: 26 }, { width: 26 },
    { width: 14 }, { width: 36 }, { width: 52 }, { width: 16 }, { width: 12 },
  ]

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="SQ_${neighborhood}_${category}_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
