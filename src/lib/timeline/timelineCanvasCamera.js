/**
 * Geographic camera computation for timeline canvas rendering.
 */

import { selectZoomLevelFractional } from './timelineTileRenderer'
import { easeInOutCubic } from './timelineCanvasEasing'
import { getEdgeSnapshotAtYear, getEdgeVisibleLineIdsAtYear } from '../edgeTimeline'

/**
 * Compute a geographic camera that fits the given bounds.
 * @param {{ minLng, minLat, maxLng, maxLat }|null} bounds
 * @param {number} width
 * @param {number} height
 * @returns {{ centerLng: number, centerLat: number, zoom: number }}
 */
export function computeGeoCamera(bounds, width, height) {
  if (!bounds) {
    return { centerLng: 116.99, centerLat: 36.65, zoom: 11 }
  }
  const centerLng = (bounds.minLng + bounds.maxLng) / 2
  const centerLat = (bounds.minLat + bounds.maxLat) / 2
  const zoom = selectZoomLevelFractional(bounds, width, height, 0.78)
  return { centerLng, centerLat, zoom }
}

/**
 * Compute camera focused on specific edges' bounding box, zoomed closer.
 */
export function computeFocusCamera(focusBounds, fullBounds, width, height) {
  if (!focusBounds) return computeGeoCamera(fullBounds, width, height)
  // Expand focus bounds slightly for context
  const padLng = Math.max((focusBounds.maxLng - focusBounds.minLng) * 0.3, 0.005)
  const padLat = Math.max((focusBounds.maxLat - focusBounds.minLat) * 0.3, 0.005)
  const expanded = {
    minLng: focusBounds.minLng - padLng,
    minLat: focusBounds.minLat - padLat,
    maxLng: focusBounds.maxLng + padLng,
    maxLat: focusBounds.maxLat + padLat,
  }
  const cam = computeGeoCamera(expanded, width, height)
  // Limit focus zoom: don't zoom in more than 2.5 levels beyond the full-extent zoom,
  // so the camera doesn't jump dramatically when a new line has a small geographic span
  const fullZoom = computeGeoCamera(fullBounds, width, height).zoom
  const maxFocusZoom = fullZoom + 2.5
  cam.zoom = Math.max(9, Math.min(maxFocusZoom, cam.zoom))
  return cam
}

/**
 * Smoothly interpolate between two geographic cameras.
 */
export function lerpGeoCamera(from, to, t) {
  const eased = easeInOutCubic(Math.max(0, Math.min(1, t)))
  return {
    centerLng: from.centerLng + (to.centerLng - from.centerLng) * eased,
    centerLat: from.centerLat + (to.centerLat - from.centerLat) * eased,
    zoom: from.zoom + (to.zoom - from.zoom) * eased,
  }
}

/**
 * Compute stats for a given year.
 */
export function computeStatsForYear(project, year) {
  const edges = (project?.edges || [])
    .map((edge) => getEdgeSnapshotAtYear(edge, year))
    .filter(Boolean)
  const stationIds = new Set()
  const lineIds = new Set()
  let totalMeters = 0
  for (const e of edges) {
    stationIds.add(e.fromStationId)
    stationIds.add(e.toStationId)
    for (const lid of getEdgeVisibleLineIdsAtYear(e, year)) lineIds.add(lid)
    totalMeters += e.lengthMeters || 0
  }
  return { lines: lineIds.size, stations: stationIds.size, km: totalMeters / 1000 }
}
