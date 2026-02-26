import { CURVE_SEGMENTS_PER_SPAN } from './constants'
import { normalizeLineStyle } from '../../lib/lineStyles'

function sanitizeFileName(value, fallback = 'metro-studio') {
  const normalized = String(value || '').trim()
  const sanitized = normalized
    .replace(/[\\/:%*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim()
  return sanitized || fallback
}

function collectProjectBounds(project) {
  const coords = []
  for (const station of project?.stations || []) {
    if (Array.isArray(station.lngLat) && station.lngLat.length === 2) {
      const [lng, lat] = station.lngLat
      if (Number.isFinite(lng) && Number.isFinite(lat)) coords.push([lng, lat])
    }
  }
  for (const edge of project?.edges || []) {
    for (const point of edge?.waypoints || []) {
      if (!Array.isArray(point) || point.length !== 2) continue
      const [lng, lat] = point
      if (Number.isFinite(lng) && Number.isFinite(lat)) coords.push([lng, lat])
    }
  }
  if (!coords.length) return null

  let minLng = Number.POSITIVE_INFINITY
  let minLat = Number.POSITIVE_INFINITY
  let maxLng = Number.NEGATIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng)
    minLat = Math.min(minLat, lat)
    maxLng = Math.max(maxLng, lng)
    maxLat = Math.max(maxLat, lat)
  }

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(maxLat)
  ) {
    return null
  }
  return {
    minLng,
    minLat,
    maxLng,
    maxLat,
  }
}

function cloneLngLat(point) {
  if (!Array.isArray(point) || point.length !== 2) return null
  const lng = Number(point[0])
  const lat = Number(point[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return [lng, lat]
}

function distanceSquared(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

function resolveEdgeWaypointsForRender(edge, stationMap) {
  if (!edge) return []
  const fromStation = stationMap.get(edge.fromStationId)
  const toStation = stationMap.get(edge.toStationId)
  const from = cloneLngLat(fromStation?.lngLat)
  const to = cloneLngLat(toStation?.lngLat)
  if (!from || !to) return []

  const rawWaypoints =
    Array.isArray(edge.waypoints) && edge.waypoints.length >= 2
      ? edge.waypoints.map((point) => cloneLngLat(point)).filter(Boolean)
      : [from, to]
  if (rawWaypoints.length < 2) {
    return [from, to]
  }

  const directError =
    distanceSquared(rawWaypoints[0], from) + distanceSquared(rawWaypoints[rawWaypoints.length - 1], to)
  const reverseError =
    distanceSquared(rawWaypoints[0], to) + distanceSquared(rawWaypoints[rawWaypoints.length - 1], from)
  const orderedWaypoints = reverseError < directError ? [...rawWaypoints].reverse() : rawWaypoints
  orderedWaypoints[0] = from
  orderedWaypoints[orderedWaypoints.length - 1] = to
  return orderedWaypoints
}

function buildCurveFromWaypoints(points, segmentCount = CURVE_SEGMENTS_PER_SPAN) {
  if (!Array.isArray(points) || points.length < 3) return points || []
  const result = [points[0]]
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    const [x0, y0] = p0
    const [x1, y1] = p1
    const [x2, y2] = p2
    const [x3, y3] = p3
    for (let j = 1; j <= segmentCount; j += 1) {
      const t = j / segmentCount
      const t2 = t * t
      const t3 = t2 * t
      const x =
        0.5 *
        ((2 * x1) +
          (-x0 + x2) * t +
          (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 +
          (-x0 + 3 * x1 - 3 * x2 + x3) * t3)
      const y =
        0.5 *
        ((2 * y1) +
          (-y0 + y2) * t +
          (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 +
          (-y0 + 3 * y1 - 3 * y2 + y3) * t3)
      result.push([x, y])
    }
  }
  return result
}

function buildBoundaryGeoJson(regionBoundary) {
  if (!regionBoundary) {
    return {
      type: 'FeatureCollection',
      features: [],
    }
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: regionBoundary,
        properties: {},
      },
    ],
  }
}

function filterEdgesByYear(edges, filterYear) {
  if (filterYear == null) return edges
  return edges.filter((edge) => edge.openingYear == null || edge.openingYear <= filterYear)
}

function filterStationsByVisibleEdges(stations, visibleEdges) {
  const visibleStationIds = new Set()
  for (const edge of visibleEdges) {
    visibleStationIds.add(edge.fromStationId)
    visibleStationIds.add(edge.toStationId)
  }
  return stations.filter((s) => visibleStationIds.has(s.id))
}

function buildStationsGeoJson(project, selectedStationIds = [], filterYear = null) {
  const allEdges = project?.edges || []
  const allStations = project?.stations || []
  const visibleEdges = filterEdgesByYear(allEdges, filterYear)
  const stations = filterYear != null ? filterStationsByVisibleEdges(allStations, visibleEdges) : allStations
  const selectedStationSet = new Set(selectedStationIds || [])

  // 根据可见线段重新计算换乘状态
  const stationLineCount = new Map()
  for (const edge of visibleEdges) {
    for (const stationId of [edge.fromStationId, edge.toStationId]) {
      if (!stationId) continue
      const lines = stationLineCount.get(stationId) || new Set()
      for (const lineId of edge.sharedByLineIds || []) {
        lines.add(lineId)
      }
      stationLineCount.set(stationId, lines)
    }
  }

  return {
    type: 'FeatureCollection',
    features: stations.map((station) => {
      // 在当前时间轴年份下，判断是否为换乘站
      const lineCount = stationLineCount.get(station.id)?.size || 0
      const isInterchange = filterYear != null ? lineCount >= 2 : station.isInterchange

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: station.lngLat,
        },
        properties: {
          id: station.id,
          nameZh: station.nameZh,
          nameEn: station.nameEn,
          isInterchange,
          underConstruction: station.underConstruction,
          proposed: station.proposed,
          isSelected: selectedStationSet.has(station.id),
        },
      }
    }),
  }
}

function buildEdgesGeoJson(project, filterYear = null, selectedEdgeIds = []) {
  const lines = new Map((project?.lines || []).map((line) => [line.id, line]))
  const allEdges = project?.edges || []
  const edges = filterEdgesByYear(allEdges, filterYear)
  const stations = new Map((project?.stations || []).map((station) => [station.id, station]))
  const selectedEdgeIdSet = new Set(selectedEdgeIds || [])

  return {
    type: 'FeatureCollection',
    features: edges
      .map((edge) => {
        const line = lines.get(edge.sharedByLineIds[0])
        const linearWaypoints = resolveEdgeWaypointsForRender(edge, stations)
        if (linearWaypoints.length < 2) return null
        const shouldSmooth = Boolean(edge?.isCurved) && linearWaypoints.length >= 3 && linearWaypoints.length <= 20
        const coordinates = shouldSmooth ? buildCurveFromWaypoints(linearWaypoints) : linearWaypoints
        const resolvedLineStyle = normalizeLineStyle(edge?.lineStyleOverride || line?.style)
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates,
          },
          properties: {
            id: edge.id,
            color: line?.color || '#2563EB',
            lineNameZh: line?.nameZh || '',
            lineNameEn: line?.nameEn || '',
            lineStyle: resolvedLineStyle,
            sharedCount: edge.sharedByLineIds.length,
            hasAnchors: linearWaypoints.length > 2,
            isSelected: selectedEdgeIdSet.has(edge.id),
          },
        }
      })
      .filter(Boolean),
  }
}

function buildEdgeAnchorsGeoJson(project, selectedEdgeId, selectedEdgeAnchor) {
  if (!selectedEdgeId) {
    return {
      type: 'FeatureCollection',
      features: [],
    }
  }
  const edge = (project?.edges || []).find((item) => item.id === selectedEdgeId)
  if (!edge) {
    return {
      type: 'FeatureCollection',
      features: [],
    }
  }

  const stationMap = new Map((project?.stations || []).map((station) => [station.id, station]))
  const waypoints = resolveEdgeWaypointsForRender(edge, stationMap)
  if (waypoints.length < 3) {
    return {
      type: 'FeatureCollection',
      features: [],
    }
  }

  const features = []
  for (let i = 1; i < waypoints.length - 1; i += 1) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: waypoints[i],
      },
      properties: {
        id: `${edge.id}_${i}`,
        edgeId: edge.id,
        anchorIndex: i,
        isSelected: selectedEdgeAnchor?.edgeId === edge.id && selectedEdgeAnchor?.anchorIndex === i,
      },
    })
  }
  return {
    type: 'FeatureCollection',
    features,
  }
}

export {
  sanitizeFileName,
  collectProjectBounds,
  buildBoundaryGeoJson,
  buildStationsGeoJson,
  buildEdgesGeoJson,
  buildEdgeAnchorsGeoJson,
  filterEdgesByYear,
  filterStationsByVisibleEdges,
  resolveEdgeWaypointsForRender,
  buildCurveFromWaypoints,
}
