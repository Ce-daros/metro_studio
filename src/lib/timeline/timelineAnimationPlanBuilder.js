/**
 * Timeline animation plan — pre-computes progressive line drawing data.
 *
 * Before playback starts, this module analyzes the project's edges grouped
 * by openingYear and builds an ordered drawing plan for each line in each
 * year. The plan includes:
 *   - Ordered edge sequences (via adjacency graph + BFS)
 *   - Cumulative pixel-length progress markers
 *   - Station reveal trigger points
 *
 * This avoids per-frame allocations during animation.
 */

import { haversineDistanceMeters } from '../geo'
import { getDisplayLineName } from '../lineNaming'

const CURVE_SEGMENTS = 14

// ─── Catmull-Rom spline (local copy to avoid cross-module import) ──

function buildCurve(points, segmentCount = CURVE_SEGMENTS) {
  if (!Array.isArray(points) || points.length < 3) return points || []
  const result = [points[0]]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    for (let j = 1; j <= segmentCount; j++) {
      const t = j / segmentCount
      const t2 = t * t
      const t3 = t2 * t
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      result.push([x, y])
    }
  }
  return result
}

// ─── Edge waypoint resolution (local copy) ──────────────────────

function cloneLngLat(point) {
  if (!Array.isArray(point) || point.length !== 2) return null
  const lng = Number(point[0])
  const lat = Number(point[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return [lng, lat]
}

function distSq(a, b) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

function resolveEdgeWaypoints(edge, stationMap) {
  if (!edge) return []
  const fromStation = stationMap.get(edge.fromStationId)
  const toStation = stationMap.get(edge.toStationId)
  const from = cloneLngLat(fromStation?.lngLat)
  const to = cloneLngLat(toStation?.lngLat)
  if (!from || !to) return []

  const raw = Array.isArray(edge.waypoints) && edge.waypoints.length >= 2
    ? edge.waypoints.map(p => cloneLngLat(p)).filter(Boolean)
    : [from, to]
  if (raw.length < 2) return [from, to]

  const directErr = distSq(raw[0], from) + distSq(raw[raw.length - 1], to)
  const reverseErr = distSq(raw[0], to) + distSq(raw[raw.length - 1], from)
  const ordered = reverseErr < directErr ? [...raw].reverse() : raw
  ordered[0] = from
  ordered[ordered.length - 1] = to
  return ordered
}

function resolveSmoothedWaypoints(edge, stationMap) {
  const linear = resolveEdgeWaypoints(edge, stationMap)
  if (linear.length < 2) return linear
  const shouldSmooth = Boolean(edge?.isCurved) && linear.length >= 3 && linear.length <= 20
  return shouldSmooth ? buildCurve(linear) : linear
}

// ─── Adjacency graph utilities ──────────────────────────────────

function buildAdjacency(edges, stationMap) {
  const adj = new Map()
  const ensure = (id) => { if (!adj.has(id)) adj.set(id, []) }
  for (const edge of edges) {
    if (!stationMap.has(edge.fromStationId) || !stationMap.has(edge.toStationId)) continue
    ensure(edge.fromStationId)
    ensure(edge.toStationId)
    const weight = Number.isFinite(edge.lengthMeters) && edge.lengthMeters > 0 ? edge.lengthMeters : 1
    adj.get(edge.fromStationId).push({ to: edge.toStationId, weight, edgeId: edge.id })
    adj.get(edge.toStationId).push({ to: edge.fromStationId, weight, edgeId: edge.id })
  }
  return adj
}

/**
 * BFS that tracks visited EDGES (not just nodes) and records traversal direction.
 * Returns an array of { edgeId, fromStationId, toStationId } where from/to
 * reflect the actual BFS traversal direction (from the node we came from,
 * toward the node we're discovering), NOT the edge's stored direction.
 */
function bfsOrder(adj, startId, componentSet, edgeSet, edgeMap) {
  const visitedNodes = new Set([startId])
  const visitedEdges = new Set()
  const queue = [startId]
  const orderedEntries = [] // { edgeId, fromStationId, toStationId }
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    for (const nb of adj.get(cur) || []) {
      if (!componentSet.has(nb.to)) continue
      if (visitedEdges.has(nb.edgeId)) continue
      visitedEdges.add(nb.edgeId)
      // Record the BFS traversal direction: cur → nb.to
      orderedEntries.push({ edgeId: nb.edgeId, fromStationId: cur, toStationId: nb.to })
      if (!visitedNodes.has(nb.to)) {
        visitedNodes.add(nb.to)
        queue.push(nb.to)
      }
    }
  }
  // Safety: append any edges in this component that BFS somehow missed
  if (edgeSet && edgeMap) {
    for (const eid of edgeSet) {
      if (!visitedEdges.has(eid)) {
        const edge = edgeMap.get(eid)
        if (edge) {
          orderedEntries.push({ edgeId: eid, fromStationId: edge.fromStationId, toStationId: edge.toStationId })
        }
      }
    }
  }
  return orderedEntries
}

/**
 * Chain traversal for loop lines — follows one direction around the loop
 * instead of BFS which alternates between two directions.
 */
function chainOrder(adj, startId, componentSet, edgeSet, edgeMap) {
  const visitedEdges = new Set()
  const orderedEntries = []
  let cur = startId
  while (true) {
    const neighbors = (adj.get(cur) || []).filter(nb => componentSet.has(nb.to) && !visitedEdges.has(nb.edgeId))
    if (!neighbors.length) break
    const nb = neighbors[0]
    visitedEdges.add(nb.edgeId)
    orderedEntries.push({ edgeId: nb.edgeId, fromStationId: cur, toStationId: nb.to })
    cur = nb.to
  }
  if (edgeSet && edgeMap) {
    for (const eid of edgeSet) {
      if (!visitedEdges.has(eid)) {
        const edge = edgeMap.get(eid)
        if (edge) orderedEntries.push({ edgeId: eid, fromStationId: edge.fromStationId, toStationId: edge.toStationId })
      }
    }
  }
  return orderedEntries
}

/**
 * Given a set of edges for a single line in a single year, determine
 * the ordered sequence of edges for progressive drawing.
 *
 * Strategy:
 * 1. Build adjacency graph from the edges
 * 2. Find ALL connected components (not just the largest)
 * 3. For each component, find terminals (degree-1 nodes)
 * 4. Prefer starting from a terminal that connects to the previous network
 * 5. If a previous-network station is mid-line (not terminal), find the
 *    nearest terminal via shortest path and start from that terminal,
 *    so drawing always begins from an endpoint
 * 6. BFS from the chosen start to get ordered edge sequence
 * 7. Concatenate all components' edge sequences
 */
function orderEdgesForDrawing(lineEdges, stationMap, previousStationIds, edgeMap) {
  if (!lineEdges.length) return []
  if (lineEdges.length === 1) {
    const e = lineEdges[0]
    return [{ edgeId: e.id, fromStationId: e.fromStationId, toStationId: e.toStationId }]
  }

  const adj = buildAdjacency(lineEdges, stationMap)

  // Find ALL connected components, not just the largest
  const allComponents = findAllComponents(adj)
  if (!allComponents.length) return lineEdges.map(e => ({ edgeId: e.id, fromStationId: e.fromStationId, toStationId: e.toStationId }))

  // Sort components: those connecting to previous network first, then by size desc
  allComponents.sort((a, b) => {
    const aConnects = previousStationIds ? a.some(id => previousStationIds.has(id)) : false
    const bConnects = previousStationIds ? b.some(id => previousStationIds.has(id)) : false
    if (aConnects !== bConnects) return aConnects ? -1 : 1
    return b.length - a.length
  })

  const allOrderedEntries = []

  // Build a map of which edges belong to each component (by station membership)
  const edgeIdsByComponent = new Map() // componentIndex → Set<edgeId>
  const stationToComponentIdx = new Map()
  for (let ci = 0; ci < allComponents.length; ci++) {
    for (const sid of allComponents[ci]) stationToComponentIdx.set(sid, ci)
    edgeIdsByComponent.set(ci, new Set())
  }
  for (const edge of lineEdges) {
    const ci = stationToComponentIdx.get(edge.fromStationId)
    if (ci != null) edgeIdsByComponent.get(ci).add(edge.id)
  }

  for (let ci = 0; ci < allComponents.length; ci++) {
    const component = allComponents[ci]
    if (component.length < 1) continue
    const componentSet = new Set(component)
    const componentEdgeSet = edgeIdsByComponent.get(ci)

    const terminals = component.filter(id => {
      const neighbors = (adj.get(id) || []).filter(nb => componentSet.has(nb.to))
      return neighbors.length <= 1
    })

    let startId = null

    if (previousStationIds && previousStationIds.size > 0) {
      // Best case: a terminal that connects to previous network
      for (const tid of terminals) {
        if (previousStationIds.has(tid)) {
          startId = tid
          break
        }
      }

      // If no terminal connects, find the nearest terminal to any connected station
      // This prevents starting from a mid-line station
      if (!startId && terminals.length > 0) {
        let connectedStation = null
        for (const sid of component) {
          if (previousStationIds.has(sid)) {
            connectedStation = sid
            break
          }
        }
        if (connectedStation) {
          // BFS from connectedStation to find nearest terminal
          startId = findNearestTerminal(adj, connectedStation, componentSet, new Set(terminals))
        }
      }
    }

    // Fall back to first terminal or first station
    if (!startId) {
      startId = terminals.length > 0 ? terminals[0] : component[0]
    }

    // For loop lines (no terminals), use chain traversal to follow one direction
    // instead of BFS which alternates between two directions
    const isLoop = terminals.length === 0 && component.length >= 3
    const entries = isLoop
      ? chainOrder(adj, startId, componentSet, componentEdgeSet, edgeMap)
      : bfsOrder(adj, startId, componentSet, componentEdgeSet, edgeMap)
    for (const entry of entries) allOrderedEntries.push(entry)
  }

  return allOrderedEntries
}

/**
 * Find all connected components in the adjacency graph.
 */
function findAllComponents(adj) {
  const visited = new Set()
  const components = []
  for (const id of adj.keys()) {
    if (visited.has(id)) continue
    const queue = [id]
    let head = 0
    visited.add(id)
    const component = []
    while (head < queue.length) {
      const cur = queue[head++]
      component.push(cur)
      for (const nb of adj.get(cur) || []) {
        if (visited.has(nb.to)) continue
        visited.add(nb.to)
        queue.push(nb.to)
      }
    }
    components.push(component)
  }
  return components
}

/**
 * BFS from a station to find the nearest terminal node.
 */
function findNearestTerminal(adj, startId, componentSet, terminalSet) {
  if (terminalSet.has(startId)) return startId
  const visited = new Set([startId])
  const queue = [startId]
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    for (const nb of adj.get(cur) || []) {
      if (!componentSet.has(nb.to) || visited.has(nb.to)) continue
      if (terminalSet.has(nb.to)) return nb.to
      visited.add(nb.to)
      queue.push(nb.to)
    }
  }
  return startId // fallback
}

// ─── Polyline length computation ────────────────────────────────

function computePolylineLength(points) {
  let len = 0
  for (let i = 1; i < points.length; i++) {
    len += haversineDistanceMeters(points[i - 1], points[i])
  }
  return len
}

// ─── Main plan builder ──────────────────────────────────────────

/**
 * @typedef {Object} StationReveal
 * @property {string} stationId
 * @property {number} triggerProgress  0..1 within the line's total length
 * @property {number[]} lngLat
 */

/**
 * @typedef {Object} OrderedSegment
 * @property {string} edgeId
 * @property {number[][]} waypoints  Smoothed [lng,lat] sequence
 * @property {string} fromStationId
 * @property {string} toStationId
 * @property {number} lengthMeters
 * @property {number} startProgress  0..1
 * @property {number} endProgress    0..1
 */

/**
 * @typedef {Object} LineDrawPlan
 * @property {string} lineId
 * @property {string} color
 * @property {string} nameZh
 * @property {string} nameEn
 * @property {string} style
 * @property {OrderedSegment[]} segments
 * @property {number} totalLength  meters
 * @property {StationReveal[]} stationReveals
 */

/**
 * @typedef {Object} YearPlan
 * @property {number} year
 * @property {LineDrawPlan[]} lineDrawPlans
 * @property {Set<string>} newStationIds       Stations first appearing this year
 * @property {Set<string>} cumulativeStationIds All stations visible up to this year
 * @property {Object[]} prevEdges              All edges from previous years (for full rendering)
 * @property {Set<string>} prevStationIds      All stations from previous years
 * @property {{ minLng: number, minLat: number, maxLng: number, maxLat: number }|null} focusBounds
 */

/**
 * Build the complete animation plan for a project.
 *
 * @param {Object} project
 * @returns {{ years: number[], yearPlans: Map<number, YearPlan> }}
 */
export function buildTimelineAnimationPlan(project) {
  if (!project) return { years: [], yearPlans: new Map() }

  const stationMap = new Map((project.stations || []).map(s => [s.id, s]))
  const lineMap = new Map((project.lines || []).map(l => [l.id, l]))
  const edgeMap = new Map((project.edges || []).map(e => [e.id, e]))

  // Collect unique year+phase combinations (同一年多期不合并)
  const yearPhaseSet = new Set()
  const phaseFirstAppearance = new Map()
  for (let edgeIndex = 0; edgeIndex < (project.edges || []).length; edgeIndex++) {
    const edge = project.edges[edgeIndex]
    if (edge.openingYear != null) {
      const phase = edge.phase || ''
      const key = `${edge.openingYear}|${phase}`
      yearPhaseSet.add(key)
      if (!phaseFirstAppearance.has(key)) {
        phaseFirstAppearance.set(key, edgeIndex)
      }
    }
  }
  // Sort by year, then by first appearance order in project data.
  // This avoids locale-based phase ordering drift (e.g. "一期/二期/三期" lexicographic issues).
  const sortedYearPhases = [...yearPhaseSet].sort((a, b) => {
    const [yearA, phaseA] = a.split('|')
    const [yearB, phaseB] = b.split('|')
    if (yearA !== yearB) return Number(yearA) - Number(yearB)
    const indexA = phaseFirstAppearance.get(a)
    const indexB = phaseFirstAppearance.get(b)
    if (Number.isFinite(indexA) && Number.isFinite(indexB) && indexA !== indexB) {
      return indexA - indexB
    }
    return phaseA.localeCompare(phaseB, 'zh')
  })
  if (!sortedYearPhases.length) return { years: [], yearPlans: new Map() }

  // Parse back to {year, phase} objects for year markers
  const years = sortedYearPhases.map(key => {
    const [yearStr, phase] = key.split('|')
    return { year: Number(yearStr), phase }
  })

  // Group edges by year+phase
  const edgesByYearPhase = new Map()
  for (const key of sortedYearPhases) edgesByYearPhase.set(key, [])
  for (const edge of project.edges || []) {
    if (edge.openingYear != null) {
      const key = `${edge.openingYear}|${edge.phase || ''}`
      if (edgesByYearPhase.has(key)) {
        edgesByYearPhase.get(key).push(edge)
      }
    }
  }

  // Build plans year by year
  const yearPlans = new Map()
  const cumulativeStationIds = new Set()
  const cumulativeEdges = []

  for (let i = 0; i < sortedYearPhases.length; i++) {
    const key = sortedYearPhases[i]
    const [yearStr, phase] = key.split('|')
    const year = Number(yearStr)
    const yearEdges = edgesByYearPhase.get(key) || []
    const prevStationIds = new Set(cumulativeStationIds)
    const prevEdges = [...cumulativeEdges]

    // Group this year's edges by line
    const edgesByLine = new Map()
    for (const edge of yearEdges) {
      for (const lineId of edge.sharedByLineIds || []) {
        if (!edgesByLine.has(lineId)) edgesByLine.set(lineId, [])
        edgesByLine.get(lineId).push(edge)
      }
    }

    const lineDrawPlans = []
    const newStationIds = new Set()

    // Focus bounds for camera
    let focusMinLng = Infinity, focusMinLat = Infinity
    let focusMaxLng = -Infinity, focusMaxLat = -Infinity

    for (const [lineId, lineEdges] of edgesByLine) {
      const line = lineMap.get(lineId)
      if (!line) continue

      // Order edges for progressive drawing (returns direction-aware entries)
      const orderedEntries = orderEdgesForDrawing(lineEdges, stationMap, prevStationIds, edgeMap)

      // Build segments with waypoints and cumulative progress
      const segments = []
      let totalLength = 0

      for (const entry of orderedEntries) {
        const edge = edgeMap.get(entry.edgeId)
        if (!edge) continue
        let waypoints = resolveSmoothedWaypoints(edge, stationMap)
        if (waypoints.length < 2) continue
        // If BFS traversal direction is opposite to edge's stored direction, reverse waypoints
        const needsReverse = entry.fromStationId !== edge.fromStationId
        if (needsReverse) waypoints = [...waypoints].reverse()
        const segLen = computePolylineLength(waypoints)
        segments.push({
          edgeId: edge.id,
          waypoints,
          fromStationId: entry.fromStationId,
          toStationId: entry.toStationId,
          lengthMeters: segLen,
          startProgress: totalLength,
          endProgress: totalLength + segLen,
        })
        totalLength += segLen
      }

      // Normalize progress to 0..1
      if (totalLength > 0) {
        for (const seg of segments) {
          seg.startProgress /= totalLength
          seg.endProgress /= totalLength
        }
      }

      // Build station reveals
      const stationReveals = []
      const revealedStations = new Set()

      for (const seg of segments) {
        // Reveal fromStation at segment start
        if (!revealedStations.has(seg.fromStationId)) {
          revealedStations.add(seg.fromStationId)
          const station = stationMap.get(seg.fromStationId)
          if (station) {
            stationReveals.push({
              stationId: seg.fromStationId,
              triggerProgress: seg.startProgress,
              lngLat: station.lngLat,
            })
            newStationIds.add(seg.fromStationId)
            updateBounds(station.lngLat)
          }
        }
        // Reveal toStation at segment end
        if (!revealedStations.has(seg.toStationId)) {
          revealedStations.add(seg.toStationId)
          const station = stationMap.get(seg.toStationId)
          if (station) {
            stationReveals.push({
              stationId: seg.toStationId,
              triggerProgress: seg.endProgress,
              lngLat: station.lngLat,
            })
            newStationIds.add(seg.toStationId)
            updateBounds(station.lngLat)
          }
        }
      }

      // Collect phase from edges (pick the most common non-empty phase)
      const phases = new Map()
      for (const entry of orderedEntries) {
        const edge = edgeMap.get(entry.edgeId)
        if (edge?.phase) phases.set(edge.phase, (phases.get(edge.phase) || 0) + 1)
      }
      let phase = ''
      if (phases.size > 0) {
        phase = [...phases.entries()].sort((a, b) => b[1] - a[1])[0][0]
      }

      // Compute interval station names (first and last station of this draw plan)
      let intervalFrom = '', intervalTo = ''
      if (segments.length > 0) {
        const firstSeg = segments[0]
        const lastSeg = segments[segments.length - 1]
        const fromSt = stationMap.get(firstSeg.fromStationId)
        const toSt = stationMap.get(lastSeg.toStationId)
        intervalFrom = fromSt?.nameZh || fromSt?.name || ''
        intervalTo = toSt?.nameZh || toSt?.name || ''
      }

      lineDrawPlans.push({
        lineId,
        color: line.color || '#2563EB',
        nameZh: getDisplayLineName(line, 'zh') || line.nameZh || '',
        nameEn: line.nameEn || '',
        style: line.style || 'solid',
        phase,
        intervalFrom,
        intervalTo,
        segments,
        totalLength,
        stationReveals,
      })
    }

    function updateBounds(lngLat) {
      if (!Array.isArray(lngLat) || lngLat.length !== 2) return
      const [lng, lat] = lngLat
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
      focusMinLng = Math.min(focusMinLng, lng)
      focusMinLat = Math.min(focusMinLat, lat)
      focusMaxLng = Math.max(focusMaxLng, lng)
      focusMaxLat = Math.max(focusMaxLat, lat)
    }

    // Update cumulative state
    for (const sid of newStationIds) cumulativeStationIds.add(sid)
    for (const edge of yearEdges) cumulativeEdges.push(edge)

    const focusBounds = Number.isFinite(focusMinLng)
      ? { minLng: focusMinLng, minLat: focusMinLat, maxLng: focusMaxLng, maxLat: focusMaxLat }
      : null

    yearPlans.set(i, {
      year,
      phase,
      lineDrawPlans,
      newStationIds,
      cumulativeStationIds: new Set(cumulativeStationIds),
      prevEdges,
      prevStationIds,
      focusBounds,
    })
  }

  return { years, yearPlans }
}

/**
 * Build a pseudo animation plan based on line order (index in project.lines).
 *
 * When no edges have openingYear set, this creates a fake timeline where
 * each line is treated as a sequential "phase". Virtual year labels are
 * 1, 2, 3… corresponding to the line array order.
 *
 * Only lines that actually own edges are included.
 *
 * @param {Object} project
 * @returns {{ years: number[], yearPlans: Map<number, YearPlan>, lineLabels: Map<number, {nameZh: string, nameEn: string, color: string}> }}
 */
export function buildPseudoTimelineAnimationPlan(project) {
  if (!project) return { years: [], yearPlans: new Map(), lineLabels: new Map() }

  const stationMap = new Map((project.stations || []).map(s => [s.id, s]))
  const lineMap = new Map((project.lines || []).map(l => [l.id, l]))
  const edgeMap = new Map((project.edges || []).map(e => [e.id, e]))

  // Build a set of edges belonging to each line, preserving line array order
  const edgesByLineId = new Map()
  for (const edge of project.edges || []) {
    for (const lineId of edge.sharedByLineIds || []) {
      if (!edgesByLineId.has(lineId)) edgesByLineId.set(lineId, [])
      edgesByLineId.get(lineId).push(edge)
    }
  }

  // Filter to lines that have edges, keep original order
  const orderedLines = (project.lines || []).filter(l => {
    const edges = edgesByLineId.get(l.id)
    return edges && edges.length > 0
  })

  if (!orderedLines.length) return { years: [], yearPlans: new Map(), lineLabels: new Map() }

  // Assign virtual years 1..N
  const years = orderedLines.map((_, i) => i + 1)
  const lineLabels = new Map()

  const yearPlans = new Map()
  const cumulativeStationIds = new Set()
  const cumulativeEdges = []

  for (let i = 0; i < orderedLines.length; i++) {
    const line = orderedLines[i]
    const virtualYear = i + 1
    const lineEdges = edgesByLineId.get(line.id) || []

    lineLabels.set(virtualYear, {
      nameZh: getDisplayLineName(line, 'zh') || line.nameZh || '',
      nameEn: line.nameEn || '',
      color: line.color || '#2563EB',
    })

    const prevStationIds = new Set(cumulativeStationIds)
    const prevEdges = [...cumulativeEdges]

    // Order edges for progressive drawing (returns direction-aware entries)
    const orderedEntries = orderEdgesForDrawing(lineEdges, stationMap, prevStationIds, edgeMap)

    // Build segments
    const segments = []
    let totalLength = 0

    for (const entry of orderedEntries) {
      const edge = edgeMap.get(entry.edgeId)
      if (!edge) continue
      let waypoints = resolveSmoothedWaypoints(edge, stationMap)
      if (waypoints.length < 2) continue
      // If BFS traversal direction is opposite to edge's stored direction, reverse waypoints
      const needsReverse = entry.fromStationId !== edge.fromStationId
      if (needsReverse) waypoints = [...waypoints].reverse()
      const segLen = computePolylineLength(waypoints)
      segments.push({
        edgeId: edge.id,
        waypoints,
        fromStationId: entry.fromStationId,
        toStationId: entry.toStationId,
        lengthMeters: segLen,
        startProgress: totalLength,
        endProgress: totalLength + segLen,
      })
      totalLength += segLen
    }

    // Normalize progress to 0..1
    if (totalLength > 0) {
      for (const seg of segments) {
        seg.startProgress /= totalLength
        seg.endProgress /= totalLength
      }
    }

    // Build station reveals
    const stationReveals = []
    const revealedStations = new Set()
    const newStationIds = new Set()

    let focusMinLng = Infinity, focusMinLat = Infinity
    let focusMaxLng = -Infinity, focusMaxLat = -Infinity

    function updateBounds(lngLat) {
      if (!Array.isArray(lngLat) || lngLat.length !== 2) return
      const [lng, lat] = lngLat
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
      focusMinLng = Math.min(focusMinLng, lng)
      focusMinLat = Math.min(focusMinLat, lat)
      focusMaxLng = Math.max(focusMaxLng, lng)
      focusMaxLat = Math.max(focusMaxLat, lat)
    }

    for (const seg of segments) {
      if (!revealedStations.has(seg.fromStationId)) {
        revealedStations.add(seg.fromStationId)
        const station = stationMap.get(seg.fromStationId)
        if (station) {
          stationReveals.push({
            stationId: seg.fromStationId,
            triggerProgress: seg.startProgress,
            lngLat: station.lngLat,
          })
          newStationIds.add(seg.fromStationId)
          updateBounds(station.lngLat)
        }
      }
      if (!revealedStations.has(seg.toStationId)) {
        revealedStations.add(seg.toStationId)
        const station = stationMap.get(seg.toStationId)
        if (station) {
          stationReveals.push({
            stationId: seg.toStationId,
            triggerProgress: seg.endProgress,
            lngLat: station.lngLat,
          })
          newStationIds.add(seg.toStationId)
          updateBounds(station.lngLat)
        }
      }
    }

    // Compute interval station names
    let intervalFrom = '', intervalTo = ''
    if (segments.length > 0) {
      const firstSeg = segments[0]
      const lastSeg = segments[segments.length - 1]
      const fromSt = stationMap.get(firstSeg.fromStationId)
      const toSt = stationMap.get(lastSeg.toStationId)
      intervalFrom = fromSt?.nameZh || fromSt?.name || ''
      intervalTo = toSt?.nameZh || toSt?.name || ''
    }

    const lineDrawPlans = [{
      lineId: line.id,
      color: line.color || '#2563EB',
      nameZh: getDisplayLineName(line, 'zh') || line.nameZh || '',
      nameEn: line.nameEn || '',
      style: line.style || 'solid',
      intervalFrom,
      intervalTo,
      segments,
      totalLength,
      stationReveals,
    }]

    // Update cumulative state
    for (const sid of newStationIds) cumulativeStationIds.add(sid)
    for (const edge of lineEdges) cumulativeEdges.push(edge)

    const focusBounds = Number.isFinite(focusMinLng)
      ? { minLng: focusMinLng, minLat: focusMinLat, maxLng: focusMaxLng, maxLat: focusMaxLat }
      : null

    yearPlans.set(virtualYear, {
      year: virtualYear,
      lineDrawPlans,
      newStationIds,
      cumulativeStationIds: new Set(cumulativeStationIds),
      prevEdges,
      prevStationIds,
      focusBounds,
    })
  }

  return { years, yearPlans, lineLabels }
}
