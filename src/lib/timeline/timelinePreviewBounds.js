/**
 * Geographic bounds collection and continuous animation plan builder.
 *
 * Pure helper functions used by the timeline preview renderer to:
 * 1. Collect geographic bounds from project stations/edges
 * 2. Build a flat continuous drawing plan from per-year animation plans
 */

/**
 * Collect geographic bounds from all stations and edge waypoints.
 * @param {Object} project
 * @returns {{ minLng: number, minLat: number, maxLng: number, maxLat: number } | null}
 */
export function collectBounds(project) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  let hasData = false
  for (const s of project?.stations || []) {
    if (!Array.isArray(s.lngLat) || s.lngLat.length !== 2) continue
    const [lng, lat] = s.lngLat
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    minLng = Math.min(minLng, lng); minLat = Math.min(minLat, lat)
    maxLng = Math.max(maxLng, lng); maxLat = Math.max(maxLat, lat)
    hasData = true
  }
  for (const e of project?.edges || []) {
    for (const p of e?.waypoints || []) {
      if (!Array.isArray(p) || p.length !== 2) continue
      const [lng, lat] = p
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
      minLng = Math.min(minLng, lng); minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng); maxLat = Math.max(maxLat, lat)
      hasData = true
    }
  }
  return hasData ? { minLng, minLat, maxLng, maxLat } : null
}

/**
 * Build a flat continuous drawing plan from the per-year animation plan.
 * Ensures waypoint continuity: each segment's start connects to the previous
 * segment's end, preventing camera oscillation on ring lines.
 *
 * @param {Object} animationPlan — the plan from buildTimelineAnimationPlan / buildPseudoTimelineAnimationPlan
 * @param {number[]|Array<{year: number, phase: string}>} years — sorted array of years to include (may be {year, phase} objects)
 * @returns {{ segments: Array, stationReveals: Array, yearMarkers: Array, totalLengthMeters: number }}
 */
export function buildContinuousPlan(animationPlan, years) {
  if (!animationPlan || !years.length) {
    return { segments: [], stationReveals: [], yearMarkers: [], totalLengthMeters: 0 }
  }

  let totalLengthMeters = 0
  for (let i = 0; i < years.length; i++) {
    const yp = animationPlan.yearPlans.get(i)
    if (!yp) continue
    for (const lp of yp.lineDrawPlans) {
      totalLengthMeters += lp.totalLength
    }
  }
  if (totalLengthMeters <= 0) {
    return { segments: [], stationReveals: [], yearMarkers: [], totalLengthMeters: 0 }
  }

  const segments = []
  const stationReveals = []
  const yearMarkers = []
  const revealedStations = new Set()
  let cumulativeLength = 0

  for (let i = 0; i < years.length; i++) {
    const yp = animationPlan.yearPlans.get(i)
    if (!yp) continue

    const yearData = years[i]
    const yearStartProgress = cumulativeLength / totalLengthMeters
    yearMarkers.push({ year: yearData, globalStart: yearStartProgress, yearPlan: yp })

    for (const lp of yp.lineDrawPlans) {
      // Track the last endpoint of the previous segment within this line
      // to ensure waypoint continuity (critical for ring lines)
      let lastEndStationId = null

      for (const seg of lp.segments) {
        const segLenMeters = seg.lengthMeters || 0
        const globalStart = cumulativeLength / totalLengthMeters
        const globalEnd = (cumulativeLength + segLenMeters) / totalLengthMeters

        // Determine correct orientation: if the previous segment ended at
        // this segment's toStation (not fromStation), we need to flip
        let waypoints = seg.waypoints
        let fromId = seg.fromStationId
        let toId = seg.toStationId

        if (lastEndStationId != null && lastEndStationId !== fromId && lastEndStationId === toId) {
          // Flip: the previous segment ended at our toStation, so draw in reverse
          waypoints = [...waypoints].reverse()
          fromId = seg.toStationId
          toId = seg.fromStationId
        }

        lastEndStationId = toId

        segments.push({
          waypoints,
          color: lp.color,
          lineId: lp.lineId,
          nameZh: lp.nameZh,
          nameEn: lp.nameEn,
          globalStart,
          globalEnd,
          fromStationId: fromId,
          toStationId: toId,
          year: typeof yearData === 'object' ? yearData.year : yearData,
        })

        if (!revealedStations.has(fromId)) {
          revealedStations.add(fromId)
          stationReveals.push({ stationId: fromId, triggerProgress: globalStart })
        }
        if (!revealedStations.has(toId)) {
          revealedStations.add(toId)
          stationReveals.push({ stationId: toId, triggerProgress: globalEnd })
        }

        cumulativeLength += segLenMeters
      }
    }
  }

  return { segments, stationReveals, yearMarkers, totalLengthMeters }
}
