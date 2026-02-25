import { bboxFromXY, buildOctilinearPolyline, segmentIntersects } from '../geo'
import { getLineStyleSchematic } from '../lineStyles'
import { getDisplayLineName } from '../lineNaming'

const STATUS_STYLE = {
  open: { opacity: 0.98, width: 8.4 },
  construction: { opacity: 0.74, width: 7.3 },
  proposed: { opacity: 0.58, width: 6.8 },
}

/** @param {import('../projectModel').RailProject} project @param {{filterYear?: number|null, leftPadding?: number, rightPadding?: number, topPadding?: number, bottomPadding?: number, mirrorVertical?: boolean, laneGap?: number, cornerRadius?: number}} [options={}] @returns {object} */
export function buildSchematicRenderModel(project, options = {}) {
  const filterYear = options.filterYear ?? null
  const allEdges = project?.edges || []
  const edges = filterYear != null
    ? allEdges.filter((e) => e.openingYear == null || e.openingYear <= filterYear)
    : allEdges
  const visibleStationIds = filterYear != null
    ? new Set(edges.flatMap((e) => [e.fromStationId, e.toStationId]))
    : null
  const stations = visibleStationIds
    ? (project?.stations || []).filter((s) => visibleStationIds.has(s.id))
    : (project?.stations || [])
  const lines = project?.lines || []
  const layoutMeta = project?.layoutMeta || {}
  const displayConfig = project?.layoutConfig?.displayConfig || {}
  const lineById = new Map(lines.map((line, index) => [line.id, { ...line, order: index }]))
  const stationById = new Map(stations.map((station) => [station.id, station]))
  const edgeDirectionById = layoutMeta.edgeDirections || {}

  const points = stations.map((station) => station.displayPos || [0, 0])
  const { minX, minY, maxX, maxY } = bboxFromXY(points)
  const leftPadding = options.leftPadding ?? 140
  const rightPadding = options.rightPadding ?? 140
  const topPadding = options.topPadding ?? 84
  const bottomPadding = options.bottomPadding ?? 92
  const width = Math.max(maxX - minX + leftPadding + rightPadding, 920)
  const height = Math.max(maxY - minY + topPadding + bottomPadding, 560)
  const xOffset = leftPadding - minX
  const yOffset = topPadding - minY
  const mirrorVertical = Boolean(options.mirrorVertical)

  const toCanvas = (point) => {
    const x = point[0] + xOffset
    const y = point[1] + yOffset
    return [x, mirrorVertical ? height - y : y]
  }
  const laneGap = options.laneGap ?? 5.2
  const cornerRadius = displayConfig.cornerRadius ?? options.cornerRadius ?? 10

  const edgePaths = []
  for (const edge of edges) {
    const from = stationById.get(edge.fromStationId)?.displayPos
    const to = stationById.get(edge.toStationId)?.displayPos
    if (!Array.isArray(from) || !Array.isArray(to)) continue
    const fromCanvas = toCanvas(from)
    const toCanvasPoint = toCanvas(to)
    const basePolyline = buildOctilinearPolyline(from, to).map(toCanvas)
    const sharedLineIds = [...new Set(edge.sharedByLineIds || [])].filter((lineId) => lineById.has(lineId))
    if (!sharedLineIds.length) continue

    const directionIndex = edgeDirectionById[edge.id]
    const fallbackAngle = Math.atan2(toCanvasPoint[1] - fromCanvas[1], toCanvasPoint[0] - fromCanvas[0])
    const edgeAngle = Number.isInteger(directionIndex)
      ? directionIndexToAngle(directionIndex, mirrorVertical)
      : fallbackAngle
    const nx = -Math.sin(edgeAngle)
    const ny = Math.cos(edgeAngle)

    sharedLineIds.forEach((lineId, index) => {
      const line = lineById.get(lineId)
      const statusStyle = STATUS_STYLE[line.status] || STATUS_STYLE.open
      const lineStyle = getLineStyleSchematic(edge.lineStyleOverride || line.style)
      const offset = (index - (sharedLineIds.length - 1) / 2) * laneGap
      const trackOffsets = Array.isArray(lineStyle.trackOffsets) && lineStyle.trackOffsets.length
        ? lineStyle.trackOffsets
        : [0]
      const trackWidthScale = Number.isFinite(lineStyle.trackWidthScale) ? lineStyle.trackWidthScale : 1
      const edgeWidthScale = displayConfig.edgeWidthScale ?? 1.0
      const edgeOpacity = displayConfig.edgeOpacity ?? 1.0
      const trackWidth = Math.max(1.8, statusStyle.width * trackWidthScale * edgeWidthScale)
      const finalOpacity = Math.max(0.05, Math.min(1, statusStyle.opacity * edgeOpacity))

      trackOffsets.forEach((trackOffset, trackIndex) => {
        const shifted = basePolyline.map(([x, y]) => [x + nx * (offset + trackOffset), y + ny * (offset + trackOffset)])
        const trackDasharray = Array.isArray(lineStyle.trackDasharrays)
          ? (lineStyle.trackDasharrays[trackIndex] ?? lineStyle.dasharray)
          : lineStyle.dasharray
        edgePaths.push({
          id: `${edge.id}_${lineId}_${index}_${trackIndex}`,
          lineId,
          order: line.order,
          color: line.color || '#2563EB',
          width: trackWidth,
          opacity: finalOpacity,
          dasharray: trackDasharray,
          lineCap: lineStyle.lineCap,
          pathD: polylineToRoundedPath(shifted, cornerRadius),
          status: line.status || 'open',
        })
      })
    })
  }

  edgePaths.sort((a, b) => statusOrder(a.status) - statusOrder(b.status) || a.order - b.order)

  // Build label bounding boxes for transfer line collision avoidance
  const labelRects = []
  const stationLabelsData = layoutMeta.stationLabels || {}
  for (const [id, station] of stationById) {
    if (!station.displayPos) continue
    const [sx, sy] = toCanvas(station.displayPos)
    const lp = stationLabelsData[id] || { dx: 12, dy: -8, anchor: 'start' }
    const lx = sx + (lp.dx || 0)
    const ly = sy + (mirrorVertical ? -(lp.dy || 0) : (lp.dy || 0))
    const anchor = lp.anchor || 'start'
    const textW = 80, textH = 24
    let rx = lx
    if (anchor === 'middle') rx = lx - textW / 2
    else if (anchor === 'end') rx = lx - textW
    labelRects.push({ x: rx, y: ly - textH * 0.7, w: textW, h: textH })
  }

  const transferPaths = []
  for (const transfer of project?.manualTransfers || []) {
    const fromPos = stationById.get(transfer.stationAId)?.displayPos
    const toPos = stationById.get(transfer.stationBId)?.displayPos
    if (!Array.isArray(fromPos) || !Array.isArray(toPos)) continue
    const fromCanvas = toCanvas(fromPos)
    const toCanvasPoint = toCanvas(toPos)
    const pathD = buildTransferPath(fromCanvas, toCanvasPoint, labelRects)
    transferPaths.push({
      id: transfer.id,
      pathD,
      fromX: fromCanvas[0], fromY: fromCanvas[1],
      toX: toCanvasPoint[0], toY: toCanvasPoint[1],
    })
  }

  const stationsRender = stations.map((station) => {
    const [x, y] = toCanvas(station.displayPos || [0, 0])
    const labelPlacement = layoutMeta.stationLabels?.[station.id] || { dx: 12, dy: -8, anchor: 'start' }
    const labelX = x + labelPlacement.dx
    const labelY = y + (mirrorVertical ? -labelPlacement.dy : labelPlacement.dy)
    const stationIconSize = displayConfig.stationIconSize ?? 1.0
    const showStationNumbers = displayConfig.showStationNumbers ?? false
    const stationNumber = showStationNumbers ? (station.lineIds?.[0] ? station.lineIds[0].split('-')[1] || '' : '') : ''
    return {
      id: station.id,
      x,
      y,
      isInterchange: Boolean(station.isInterchange),
      underConstruction: Boolean(station.underConstruction),
      proposed: Boolean(station.proposed),
      nameZh: station.nameZh || '',
      nameEn: station.nameEn || '',
      labelX,
      labelY,
      labelAnchor: labelPlacement.anchor || 'start',
      stationIconSize,
      stationIconStyle: displayConfig.stationIconStyle ?? 'circle',
      stationNumber,
    }
  })

  const lineLabels = buildLineLabels(lines, edges, stationById, toCanvas, layoutMeta, mirrorVertical, displayConfig, transferPaths)

  return {
    width,
    height,
    edgePaths,
    transferPaths,
    stations: stationsRender,
    lineLabels,
    theme: {
      background: '#ECEFF1',
      panelText: '#39B6D7',
      lineText: '#2A3440',
      enSubtle: '#7C8A96',
      stationStroke: '#1F2937',
      interchangeStroke: '#334155',
    },
  }
}

function buildLineLabels(lines, edges, stationById, toCanvas, layoutMeta, mirrorVertical, displayConfig, transferPaths) {
  const stationLabels = layoutMeta?.stationLabels || {}
  const showLineBadges = displayConfig.showLineBadges ?? true

  // --- Collect all obstacles for collision testing ---
  const obstacleRects = [] // { x, y, w, h } axis-aligned boxes
  const obstacleSegs = []  // { x1, y1, x2, y2 } line segments

  // 1) Station circles as bounding boxes (radius ~6 with margin)
  for (const [, station] of stationById) {
    if (!station.displayPos) continue
    const [sx, sy] = toCanvas(station.displayPos)
    obstacleRects.push({ x: sx - 10, y: sy - 10, w: 20, h: 20 })
  }

  // 2) Station label text boxes (estimate ~70x22 for zh, offset by labelPlacement)
  for (const [id, station] of stationById) {
    if (!station.displayPos) continue
    const [sx, sy] = toCanvas(station.displayPos)
    const lp = stationLabels[id] || { dx: 12, dy: -8, anchor: 'start' }
    const lx = sx + (lp.dx || 0)
    const ly = sy + (mirrorVertical ? -(lp.dy || 0) : (lp.dy || 0))
    const anchor = lp.anchor || 'start'
    const textW = 80
    const textH = 24
    let rx = lx
    if (anchor === 'middle') rx = lx - textW / 2
    else if (anchor === 'end') rx = lx - textW
    obstacleRects.push({ x: rx, y: ly - textH * 0.7, w: textW, h: textH })
  }

  // 3) Edge polyline segments
  for (const edge of edges) {
    const from = stationById.get(edge.fromStationId)?.displayPos
    const to = stationById.get(edge.toStationId)?.displayPos
    if (!Array.isArray(from) || !Array.isArray(to)) continue
    const poly = buildOctilinearPolyline(from, to).map(toCanvas)
    for (let i = 0; i < poly.length - 1; i++) {
      obstacleSegs.push({ x1: poly[i][0], y1: poly[i][1], x2: poly[i + 1][0], y2: poly[i + 1][1] })
    }
  }

  // 4) Manual transfer segments
  for (const tp of transferPaths || []) {
    obstacleSegs.push({ x1: tp.fromX, y1: tp.fromY, x2: tp.toX, y2: tp.toY })
  }

  // --- Helper: test if a rect collides with any obstacle ---
  const BADGE_W = 80
  const BADGE_H = 50
  const MARGIN = 6

  function rectOverlapsRect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  }

  function segIntersectsRect(seg, r) {
    // Test segment against 4 edges of rect
    const corners = [
      [r.x, r.y], [r.x + r.w, r.y],
      [r.x + r.w, r.y + r.h], [r.x, r.y + r.h],
    ]
    for (let i = 0; i < 4; i++) {
      const c1 = corners[i]
      const c2 = corners[(i + 1) % 4]
      if (segmentIntersects([seg.x1, seg.y1], [seg.x2, seg.y2], c1, c2)) return true
    }
    // Also check if segment is fully inside rect
    if (seg.x1 >= r.x && seg.x1 <= r.x + r.w && seg.y1 >= r.y && seg.y1 <= r.y + r.h) return true
    return false
  }

  function candidateCollides(cx, cy, placedLabels) {
    const rect = { x: cx - BADGE_W / 2 - MARGIN, y: cy - BADGE_H / 2 - MARGIN, w: BADGE_W + MARGIN * 2, h: BADGE_H + MARGIN * 2 }
    for (const obs of obstacleRects) {
      if (rectOverlapsRect(rect, obs)) return true
    }
    for (const seg of obstacleSegs) {
      if (segIntersectsRect(seg, rect)) return true
    }
    for (const placed of placedLabels) {
      const pr = { x: placed.x - BADGE_W / 2 - MARGIN, y: placed.y - BADGE_H / 2 - MARGIN, w: BADGE_W + MARGIN * 2, h: BADGE_H + MARGIN * 2 }
      if (rectOverlapsRect(rect, pr)) return true
    }
    return false
  }

  // --- Build labels with collision avoidance ---
  const labels = []
  const distances = [70, 95, 120, 150, 185, 220]
  const angleOffsets = [0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2, Math.PI * 2 / 3, -Math.PI * 2 / 3, Math.PI * 5 / 6, -Math.PI * 5 / 6, Math.PI]

  for (const line of lines) {
    const lineEdges = edges.filter(
      (edge) => Array.isArray(edge.sharedByLineIds) && edge.sharedByLineIds.includes(line.id),
    )
    if (!lineEdges.length) continue

    const adjacency = new Map()
    for (const edge of lineEdges) {
      if (!stationById.has(edge.fromStationId) || !stationById.has(edge.toStationId)) continue
      if (!adjacency.has(edge.fromStationId)) adjacency.set(edge.fromStationId, [])
      if (!adjacency.has(edge.toStationId)) adjacency.set(edge.toStationId, [])
      adjacency.get(edge.fromStationId).push(edge.toStationId)
      adjacency.get(edge.toStationId).push(edge.fromStationId)
    }
    if (!adjacency.size) continue

    const terminals = []
    for (const [stationId, neighbors] of adjacency) {
      if (neighbors.length === 1) terminals.push(stationId)
    }

    const isLoop = terminals.length === 0 && adjacency.size >= 3
    const nameZh = getDisplayLineName(line, 'zh') || line.nameZh || ''
    const number = extractSchematicLineNumber(nameZh, line.nameEn, line.key)

    let anchorX, anchorY, baseAngle

    if (isLoop) {
      // For loops, anchor at topmost station, base direction = upward
      const stationIds = [...adjacency.keys()]
      let topId = stationIds[0]
      let topY = Infinity
      for (const sid of stationIds) {
        const s = stationById.get(sid)
        if (!s?.displayPos) continue
        const [, sy] = toCanvas(s.displayPos)
        if (sy < topY) { topY = sy; topId = sid }
      }
      const topStation = stationById.get(topId)
      if (!topStation?.displayPos) continue
      const [tx, ty] = toCanvas(topStation.displayPos)
      anchorX = tx
      anchorY = ty
      baseAngle = -Math.PI / 2 // upward
    } else {
      // For non-loops, anchor at terminal, base direction = outward from neighbor
      const terminalId = terminals.length ? terminals[terminals.length - 1] : adjacency.keys().next().value
      const station = stationById.get(terminalId)
      if (!station?.displayPos) continue
      const [cx, cy] = toCanvas(station.displayPos)
      anchorX = cx
      anchorY = cy

      const neighborIds = adjacency.get(terminalId) || []
      if (neighborIds.length) {
        const neighbor = stationById.get(neighborIds[0])
        if (neighbor?.displayPos) {
          const [nx, ny] = toCanvas(neighbor.displayPos)
          baseAngle = Math.atan2(cy - ny, cx - nx) // outward from neighbor
        } else {
          baseAngle = 0
        }
      } else {
        baseAngle = 0
      }
    }

    // Try candidates: distance x angle, pick first non-colliding
    let bestX = anchorX + Math.cos(baseAngle) * distances[0]
    let bestY = anchorY + Math.sin(baseAngle) * distances[0]
    let found = false

    for (const dist of distances) {
      if (found) break
      for (const aOff of angleOffsets) {
        const angle = baseAngle + aOff
        const cx = anchorX + Math.cos(angle) * dist
        const cy = anchorY + Math.sin(angle) * dist
        if (!candidateCollides(cx, cy, labels)) {
          bestX = cx
          bestY = cy
          found = true
          break
        }
      }
    }

    labels.push({
      id: line.id,
      nameZh,
      nameEn: line.nameEn || '',
      color: line.color || '#2563EB',
      number,
      x: bestX,
      y: bestY,
      showLineBadges,
    })
  }
  return labels
}

function extractSchematicLineNumber(nameZh, nameEn, key) {
  for (const value of [nameZh, nameEn, key]) {
    const str = String(value || '').trim()
    if (!str) continue
    const zhMatch = str.match(/(\d+)\s*号?\s*线/u)
    if (zhMatch?.[1]) return zhMatch[1]
    const enMatch = str.match(/\bline\s*([0-9]+)/i)
    if (enMatch?.[1]) return enMatch[1]
  }
  return ''
}

function statusOrder(status) {
  if (status === 'proposed') return 0
  if (status === 'construction') return 1
  return 2
}

function directionIndexToAngle(index, mirrorVertical = false) {
  const normalized = (((index % 8) + 8) % 8) * (Math.PI / 4)
  return mirrorVertical ? -normalized : normalized
}

function polylineToRoundedPath(points, radius) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`
  }

  const safeRadius = Math.max(0, radius)
  let d = `M ${points[0][0]} ${points[0][1]}`

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]
    const curr = points[i]
    const next = points[i + 1]

    const inVec = [curr[0] - prev[0], curr[1] - prev[1]]
    const outVec = [next[0] - curr[0], next[1] - curr[1]]
    const inLen = Math.hypot(inVec[0], inVec[1])
    const outLen = Math.hypot(outVec[0], outVec[1])

    if (inLen < 1e-6 || outLen < 1e-6 || safeRadius < 0.5) {
      d += ` L ${curr[0]} ${curr[1]}`
      continue
    }

    const trim = Math.min(safeRadius, inLen * 0.48, outLen * 0.48)
    const inUnit = [inVec[0] / inLen, inVec[1] / inLen]
    const outUnit = [outVec[0] / outLen, outVec[1] / outLen]

    const p1 = [curr[0] - inUnit[0] * trim, curr[1] - inUnit[1] * trim]
    const p2 = [curr[0] + outUnit[0] * trim, curr[1] + outUnit[1] * trim]

    d += ` L ${p1[0]} ${p1[1]} Q ${curr[0]} ${curr[1]} ${p2[0]} ${p2[1]}`
  }

  const last = points[points.length - 1]
  d += ` L ${last[0]} ${last[1]}`
  return d
}

function segHitsRect(x1, y1, x2, y2, r) {
  const corners = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]
  for (let i = 0; i < 4; i++) {
    if (segmentIntersects([x1, y1], [x2, y2], corners[i], corners[(i + 1) % 4])) return true
  }
  // segment fully inside rect
  if (x1 >= r.x && x1 <= r.x + r.w && y1 >= r.y && y1 <= r.y + r.h) return true
  return false
}

function buildTransferPath(from, to, labelRects) {
  const [x1, y1] = from
  const [x2, y2] = to
  // Find all label rects that the straight line intersects
  const hitRects = labelRects.filter(r => segHitsRect(x1, y1, x2, y2, r))
  if (!hitRects.length) return `M ${x1} ${y1} L ${x2} ${y2}`

  // Try nudging with a midpoint offset to avoid collisions
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  // Perpendicular direction
  const nx = -dy / len
  const ny = dx / len

  const offsets = [15, -15, 30, -30, 50, -50]
  for (const off of offsets) {
    const cx = mx + nx * off
    const cy = my + ny * off
    const hitsAny = labelRects.some(r =>
      segHitsRect(x1, y1, cx, cy, r) || segHitsRect(cx, cy, x2, y2, r)
    )
    if (!hitsAny) {
      return `M ${x1} ${y1} L ${cx} ${cy} L ${x2} ${y2}`
    }
  }
  // Fallback: use largest offset
  const cx = mx + nx * 50
  const cy = my + ny * 50
  return `M ${x1} ${y1} L ${cx} ${cy} L ${x2} ${y2}`
}
