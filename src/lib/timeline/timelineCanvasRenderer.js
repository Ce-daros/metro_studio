/**
 * Geographic canvas renderer for timeline animation.
 *
 * Renders rail network on OSM tile background using real lngLat coordinates.
 * Includes progressive line drawing, station reveal animations, and
 * professional overlay UI (year, stats, events, branding, scale bar).
 *
 * Used by timelinePreviewRenderer.js.
 */

import { lngLatToPixel } from './timelineTileRenderer'
import { slicePolylineByProgress } from './timelineAnimationPlan'
import { easeOutBack } from './timelineCanvasEasing'
import { roundRect, geoLineWidth, drawGeoPolyline, resolveWaypointsSimple } from './timelineCanvasGeometry'

// ─── Re-exports from sub-modules (backward compatibility) ────────

export { loadSourceHanSans, FONT_FAMILY } from './timelineCanvasFont'
export { easeInOutCubic, easeOutCubic, easeOutBack, easeOutElastic } from './timelineCanvasEasing'
export { computeGeoCamera, computeFocusCamera, lerpGeoCamera, computeStatsForYear } from './timelineCanvasCamera'
export { roundRect, uiScale, geoLineWidth, drawGeoPolyline, resolveWaypointsSimple, measurePillWidth, drawStatPill } from './timelineCanvasGeometry'
export {
  renderOverlayYear, renderOverlayStats, renderOverlayEvent,
  renderOverlayScaleBar, renderOverlayBranding, renderOverlayLineInfo,
  renderScanLineLoading,
} from './timelineCanvasOverlays'

// ─── Edge rendering (geographic) ────────────────────────────────

/**
 * Render all previously-completed edges (from prior years) as full lines.
 */
export function renderPrevEdges(ctx, prevEdges, camera, width, height, stationMap, lineMap) {
  const lw = geoLineWidth(camera.zoom)
  for (const edge of prevEdges) {
    const line = lineMap.get((edge.sharedByLineIds || [])[0])
    const color = line?.color || '#2563EB'
    const from = stationMap.get(edge.fromStationId)
    const to = stationMap.get(edge.toStationId)
    if (!from || !to) continue

    // Resolve waypoints inline
    let waypoints = edge._cachedWaypoints
    if (!waypoints) {
      waypoints = resolveWaypointsSimple(edge, from, to)
      edge._cachedWaypoints = waypoints
    }
    if (waypoints.length < 2) continue
    drawGeoPolyline(ctx, waypoints, camera, width, height, color, lw, 0.85)
  }
}

/**
 * Render the current year's edges with progressive drawing animation.
 */
export function renderAnimatedEdges(ctx, yearPlan, drawProgress, camera, width, height) {
  const lw = geoLineWidth(camera.zoom)
  for (const plan of yearPlan.lineDrawPlans) {
    for (const seg of plan.segments) {
      // Determine how much of this segment to draw
      const segSpan = seg.endProgress - seg.startProgress
      if (segSpan <= 0) continue
      const segProgress = Math.max(0, Math.min(1, (drawProgress - seg.startProgress) / segSpan))
      if (segProgress <= 0) continue

      const { points: slicedPoints } = slicePolylineByProgress(seg.waypoints, segProgress)
      if (slicedPoints.length < 2) continue
      drawGeoPolyline(ctx, slicedPoints, camera, width, height, plan.color, lw, 1)
    }
  }
}

// ─── Station rendering (geographic) ─────────────────────────────

/**
 * Render stations as circles/interchange markers with full animation support.
 *
 * opts.stationAnimState: Map<stationId, { popT, interchangeT, labelAlpha }>
 *   - popT: 0..1 station pop-in progress (easeOutBack applied externally)
 *   - interchangeT: 0..1 morph from circle to interchange rounded-rect
 *   - labelAlpha: 0..1 label fade-in
 * When stationAnimState is not provided, all stations render at full state (idle mode).
 */
export function renderStations(ctx, stationIds, camera, width, height, stationMap, opts = {}) {
  const alpha = opts.alpha ?? 1
  const zoom = camera.zoom
  const radius = Math.max(2.5, 3.5 * Math.pow(2, (zoom - 12) * 0.35))
  const fontSize = Math.max(8, 11 * Math.pow(2, (zoom - 12) * 0.25))
  const animState = opts.stationAnimState || null

  ctx.save()
  ctx.globalAlpha = alpha

  for (const sid of stationIds) {
    const station = stationMap.get(sid)
    if (!station?.lngLat) continue
    const [px, py] = lngLatToPixel(station.lngLat[0], station.lngLat[1], camera, width, height)

    // Skip if off-screen
    if (px < -50 || px > width + 50 || py < -50 || py > height + 50) continue

    // Animation state for this station
    const anim = animState?.get(sid)
    const popT = anim ? anim.popT : 1
    const interchangeT = anim ? anim.interchangeT : (station.isInterchange ? 1 : 0)
    const labelAlpha = anim ? anim.labelAlpha : 1

    if (popT <= 0) continue // not yet revealed

    // Pop-in: scale from 0 to overshoot then settle
    const scale = popT < 1 ? easeOutBack(popT) : 1
    const stationAlpha = Math.min(1, popT * 2) // fade in during first half of pop

    ctx.save()
    ctx.globalAlpha = alpha * stationAlpha
    ctx.translate(px, py)
    if (scale !== 1) ctx.scale(scale, scale)

    // Morph between circle and interchange rounded-rect
    ctx.beginPath()
    if (interchangeT > 0.01) {
      // Interpolate dimensions: circle (r,r) → interchange (1.4r, 0.9r) rounded rect
      const morphW = radius * (1 + interchangeT * 0.4) // 1r → 1.4r half-width
      const morphH = radius * (1 - interchangeT * 0.1) // 1r → 0.9r half-height
      const morphR = radius * (1 - interchangeT * 0.15) // corner radius shrinks slightly
      if (interchangeT >= 0.99) {
        // Full interchange
        roundRect(ctx, -radius * 1.4, -radius * 0.9, radius * 2.8, radius * 1.8, radius * 0.85)
      } else {
        // Morphing: draw as rounded rect with interpolated dimensions
        roundRect(ctx, -morphW, -morphH, morphW * 2, morphH * 2, morphR)
      }
    } else {
      ctx.arc(0, 0, radius, 0, Math.PI * 2)
    }
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = interchangeT > 0.5 ? '#334155' : '#1F2937'
    ctx.lineWidth = Math.max(1, radius * 0.42)
    ctx.stroke()

    ctx.restore()

    // Station name (only at sufficient zoom) — with halo to avoid line overlap
    if (zoom >= 11 && opts.showLabels !== false && labelAlpha > 0.01) {
      const labelX = px + radius + 3
      const zhFont = `${fontSize}px 微软雅黑, "Source Han Sans SC", "Microsoft YaHei", sans-serif`
      const zhText = station.nameZh || ''

      ctx.save()
      ctx.globalAlpha = alpha * labelAlpha
      ctx.font = zhFont
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      // White halo
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)'
      ctx.lineWidth = Math.max(2, fontSize * 0.22)
      ctx.lineJoin = 'round'
      ctx.strokeText(zhText, labelX, py - fontSize * 0.3)
      ctx.fillStyle = '#1a1a2e'
      ctx.fillText(zhText, labelX, py - fontSize * 0.3)

      if (station.nameEn && zoom >= 12.5) {
        const enFont = `500 ${fontSize * 0.78}px "Roboto Condensed", "Arial Narrow", sans-serif`
        ctx.font = enFont
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.68)'
        ctx.lineWidth = Math.max(1.5, fontSize * 0.18)
        ctx.strokeText(station.nameEn, labelX, py + fontSize * 0.65)
        ctx.fillStyle = '#7b8794'
        ctx.fillText(station.nameEn, labelX, py + fontSize * 0.65)
      }
      ctx.restore()
    }
  }

  ctx.restore()
}

/**
 * Render stations that are being revealed this year, with fade-in based on drawProgress.
 */
export function renderAnimatedStations(ctx, yearPlan, drawProgress, camera, width, height, stationMap) {
  const zoom = camera.zoom
  const radius = Math.max(2.5, 3.5 * Math.pow(2, (zoom - 12) * 0.35))
  const fontSize = Math.max(8, 11 * Math.pow(2, (zoom - 12) * 0.25))

  for (const plan of yearPlan.lineDrawPlans) {
    for (const reveal of plan.stationReveals) {
      // Station appears when drawProgress reaches its trigger
      const revealT = reveal.triggerProgress
      const fadeProgress = revealT <= 0 ? 1 : Math.max(0, Math.min(1, (drawProgress - revealT + 0.05) / 0.05))
      if (fadeProgress <= 0) continue

      const station = stationMap.get(reveal.stationId)
      if (!station?.lngLat) continue
      const [px, py] = lngLatToPixel(station.lngLat[0], station.lngLat[1], camera, width, height)
      if (px < -50 || px > width + 50 || py < -50 || py > height + 50) continue

      const scale = 0.5 + fadeProgress * 0.5
      const alpha = fadeProgress

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(px, py)
      ctx.scale(scale, scale)

      ctx.beginPath()
      if (station.isInterchange) {
        roundRect(ctx, -radius * 1.4, -radius * 0.9, radius * 2.8, radius * 1.8, radius * 0.85)
      } else {
        ctx.arc(0, 0, radius, 0, Math.PI * 2)
      }
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.strokeStyle = station.isInterchange ? '#334155' : '#1F2937'
      ctx.lineWidth = Math.max(1, radius * 0.42)
      ctx.stroke()

      ctx.restore()

      // Label — with halo to avoid line overlap
      if (zoom >= 11 && fadeProgress > 0.5) {
        const labelX = px + radius + 3
        const labelAlpha = Math.max(0, (fadeProgress - 0.5) * 2)
        ctx.save()
        ctx.globalAlpha = labelAlpha

        const zhFont = `${fontSize}px 微软雅黑, "Source Han Sans SC", "Microsoft YaHei", sans-serif`
        ctx.font = zhFont
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
        ctx.lineWidth = Math.max(2.5, fontSize * 0.28)
        ctx.lineJoin = 'round'
        ctx.strokeText(station.nameZh || '', labelX, py - fontSize * 0.3)
        ctx.fillStyle = '#1a1a2e'
        ctx.fillText(station.nameZh || '', labelX, py - fontSize * 0.3)

        if (station.nameEn && zoom >= 12.5) {
          ctx.font = `500 ${fontSize * 0.78}px "Roboto Condensed", "Arial Narrow", sans-serif`
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.68)'
          ctx.lineWidth = Math.max(1.5, fontSize * 0.18)
          ctx.strokeText(station.nameEn, labelX, py + fontSize * 0.65)
          ctx.fillStyle = '#7b8794'
          ctx.fillText(station.nameEn, labelX, py + fontSize * 0.65)
        }
        ctx.restore()
      }
    }
  }
}

// ─── Tip glow effect ─────────────────────────────────────────────

/**
 * Render a glowing dot at the drawing tip to highlight where the line is being drawn.
 */
export function renderTipGlow(ctx, tipLng, tipLat, camera, width, height, color, pulseT) {
  if (tipLng == null || tipLat == null) return
  const [px, py] = lngLatToPixel(tipLng, tipLat, camera, width, height)
  if (px < -100 || px > width + 100 || py < -100 || py > height + 100) return

  const zoom = camera.zoom
  const baseRadius = Math.max(4, 6 * Math.pow(2, (zoom - 12) * 0.35))

  // Pulsing glow: oscillates between 0.6 and 1.0
  const pulse = 0.6 + 0.4 * Math.sin(pulseT * Math.PI * 2)

  ctx.save()

  // Outer glow (large, soft)
  const outerR = baseRadius * 3 * pulse
  const gradient = ctx.createRadialGradient(px, py, 0, px, py, outerR)
  gradient.addColorStop(0, color + '80') // 50% alpha at center
  gradient.addColorStop(0.4, color + '30') // 19% alpha
  gradient.addColorStop(1, color + '00') // transparent
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(px, py, outerR, 0, Math.PI * 2)
  ctx.fill()

  // Inner bright dot
  const innerR = baseRadius * 0.8
  ctx.fillStyle = '#ffffff'
  ctx.globalAlpha = 0.9
  ctx.beginPath()
  ctx.arc(px, py, innerR, 0, Math.PI * 2)
  ctx.fill()

  // Color ring
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.5, baseRadius * 0.35)
  ctx.globalAlpha = 0.8 * pulse
  ctx.beginPath()
  ctx.arc(px, py, baseRadius * 1.2, 0, Math.PI * 2)
  ctx.stroke()

  ctx.restore()
}
