/**
 * Geometry helpers for timeline canvas rendering.
 */

import { lngLatToPixel } from './timelineTileRenderer'

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export function uiScale(width, height) {
  return Math.min(width / 1920, height / 1080)
}

/**
 * Compute line width based on zoom level.
 */
export function geoLineWidth(zoom) {
  return Math.max(2, 3.5 * Math.pow(2, (zoom - 12) * 0.45))
}

/**
 * Draw a polyline of [lng,lat] points onto the canvas.
 */
export function drawGeoPolyline(ctx, points, camera, width, height, color, lineWidth, alpha) {
  if (!points || points.length < 2) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([])
  ctx.beginPath()
  const [sx, sy] = lngLatToPixel(points[0][0], points[0][1], camera, width, height)
  ctx.moveTo(sx, sy)
  for (let i = 1; i < points.length; i++) {
    const [px, py] = lngLatToPixel(points[i][0], points[i][1], camera, width, height)
    ctx.lineTo(px, py)
  }
  ctx.stroke()
  ctx.restore()
}

export function resolveWaypointsSimple(edge, fromStation, toStation) {
  const from = fromStation?.lngLat
  const to = toStation?.lngLat
  if (!from || !to) return []
  const raw = Array.isArray(edge.waypoints) && edge.waypoints.length >= 2
    ? edge.waypoints.filter(p => Array.isArray(p) && p.length === 2)
    : [from, to]
  if (raw.length < 2) return [from, to]
  // Direction correction
  const dF = (raw[0][0] - from[0]) ** 2 + (raw[0][1] - from[1]) ** 2
  const dR = (raw[0][0] - to[0]) ** 2 + (raw[0][1] - to[1]) ** 2
  const ordered = dR < dF ? [...raw].reverse() : raw
  ordered[0] = from
  ordered[ordered.length - 1] = to
  return ordered
}

export function measurePillWidth(ctx, text, s, pillH) {
  ctx.font = `700 ${16 * s}px "Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif`
  const tw = ctx.measureText(text).width
  return tw + pillH  // padding = pillH/2 on each side
}

export function drawStatPill(ctx, x, y, h, r, s, text) {
  ctx.font = `700 ${16 * s}px "Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif`
  const tw = ctx.measureText(text).width
  const w = tw + h  // padding = h/2 on each side

  // Pill background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = 1.2 * s
  roundRect(ctx, x, y, w, h, r)
  ctx.fill()
  ctx.stroke()

  // Text
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, y + h / 2)
}
