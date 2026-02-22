import { createId } from '../ids'
import { postOverpassQuery } from './overpassClient'
import { findCityPresetByRelationId } from './cityPresets'
import {
  createLineFromRelation,
  readStationName,
  toLineKey,
} from './jinan/naming'
import {
  classifyRelationStatus,
  classifyStationStatus,
  isSubwayStationNode,
  mergeLineStatus,
  shouldIncludeStatus,
} from './jinan/status'
import {
  buildGlobalAdjacency,
  getOrderedStopNodeRefs,
  indexElements,
  mergeElements,
  mergeStationsAndTopology,
  shortestPath,
  sumPathLength,
  toNodeLngLat,
} from './jinan/topology'

const STOP_ROLE_REGEX = /(stop|platform|station)/i

// ── Overpass query builders ─────────────────────────────────

function bboxToOverpass(bbox) {
  // Overpass bbox format: south,west,north,east
  return `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`
}

function buildRelationsOnlyQuery(bbox, includeConstruction, includeProposed) {
  const bb = bboxToOverpass(bbox)
  const clauses = [
    `relation(${bb})["type"="route"]["route"~"subway|light_rail"];`,
  ]
  if (includeConstruction) {
    clauses.push(`relation(${bb})["type"="route"]["route"="construction"];`)
    clauses.push(`relation(${bb})["type"="route"]["construction"~"subway|light_rail"];`)
    clauses.push(`relation(${bb})["type"="route"]["state"="construction"];`)
  }
  if (includeProposed) {
    clauses.push(`relation(${bb})["type"="route"]["state"="proposed"];`)
    clauses.push(`relation(${bb})["type"="route"]["proposed"~"subway|light_rail"];`)
  }
  return `
[out:json][timeout:30];
(
  ${clauses.join('\n  ')}
);
out body;
`.trim()
}

function buildWayNodesQuery(wayIds) {
  if (!wayIds.length) return null
  return `
[out:json][timeout:120];
(
  ${wayIds.map((id) => `way(${id});`).join('\n  ')}
);
out body qt;
>;
out body qt;
`.trim()
}

function buildStandaloneStationQuery(bbox, includeConstruction, includeProposed) {
  const bb = bboxToOverpass(bbox)
  const clauses = []
  if (includeConstruction) {
    clauses.push(`node(${bb})["construction:railway"~"station|subway|light_rail"];`)
    clauses.push(`node(${bb})["railway"="construction"]["station"~"subway|light_rail"];`)
    clauses.push(`node(${bb})["railway"="station"]["station"~"subway|light_rail"]["state"="construction"];`)
    clauses.push(`node(${bb})["railway"="station"]["station"~"subway|light_rail"]["construction"];`)
  }
  if (includeProposed) {
    clauses.push(`node(${bb})["proposed:railway"~"station|subway|light_rail"];`)
    clauses.push(`node(${bb})["railway"="proposed"]["station"~"subway|light_rail"];`)
    clauses.push(`node(${bb})["railway"="station"]["station"~"subway|light_rail"]["state"="proposed"];`)
    clauses.push(`node(${bb})["railway"="station"]["station"~"subway|light_rail"]["proposed"];`)
  }
  if (!clauses.length) return null
  return `
[out:json][timeout:30];
(
  ${clauses.join('\n  ')}
);
out body;
`.trim()
}

function buildBoundaryQuery(relationId) {
  return `
[out:json][timeout:60];
relation(${relationId});
out body;
>;
out skel qt;
`.trim()
}

// ── Boundary geometry extraction ────────────────────────────

function extractBoundaryGeometry(elements) {
  const nodes = new Map()
  let boundaryRelation = null

  for (const el of elements) {
    if (el.type === 'node' && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
      nodes.set(el.id, [Number(el.lon), Number(el.lat)])
    }
    if (el.type === 'relation') {
      boundaryRelation = el
    }
  }

  if (!boundaryRelation) return null

  const outerWays = new Map()
  for (const el of elements) {
    if (el.type === 'way' && Array.isArray(el.nodes)) {
      outerWays.set(el.id, el.nodes)
    }
  }

  const outerMembers = (boundaryRelation.members || [])
    .filter((m) => m.type === 'way' && (!m.role || m.role === 'outer'))
    .map((m) => m.ref)

  const rings = assembleRings(outerMembers, outerWays, nodes)
  if (!rings.length) return null

  if (rings.length === 1) {
    return { type: 'Polygon', coordinates: [rings[0]] }
  }
  return { type: 'MultiPolygon', coordinates: rings.map((ring) => [ring]) }
}

function assembleRings(wayRefs, waysMap, nodesMap) {
  const segments = []
  for (const ref of wayRefs) {
    const nodeIds = waysMap.get(ref)
    if (!nodeIds || nodeIds.length < 2) continue
    const coords = nodeIds.map((nid) => nodesMap.get(nid)).filter(Boolean)
    if (coords.length >= 2) {
      segments.push(coords)
    }
  }

  const rings = []
  const used = new Set()

  while (used.size < segments.length) {
    let ring = null
    for (let i = 0; i < segments.length; i += 1) {
      if (used.has(i)) continue
      ring = [...segments[i]]
      used.add(i)
      break
    }
    if (!ring) break

    let changed = true
    while (changed) {
      changed = false
      const ringStart = ring[0]
      const ringEnd = ring[ring.length - 1]

      if (coordsEqual(ringStart, ringEnd) && ring.length >= 4) break

      for (let i = 0; i < segments.length; i += 1) {
        if (used.has(i)) continue
        const seg = segments[i]
        const segStart = seg[0]
        const segEnd = seg[seg.length - 1]

        if (coordsEqual(ringEnd, segStart)) {
          ring.push(...seg.slice(1))
          used.add(i)
          changed = true
        } else if (coordsEqual(ringEnd, segEnd)) {
          ring.push(...[...seg].reverse().slice(1))
          used.add(i)
          changed = true
        } else if (coordsEqual(ringStart, segEnd)) {
          ring.unshift(...seg.slice(0, -1))
          used.add(i)
          changed = true
        } else if (coordsEqual(ringStart, segStart)) {
          ring.unshift(...[...seg].reverse().slice(0, -1))
          used.add(i)
          changed = true
        }
      }
    }

    if (ring.length >= 4 && coordsEqual(ring[0], ring[ring.length - 1])) {
      rings.push(ring)
    } else if (ring.length >= 4) {
      ring.push([...ring[0]])
      rings.push(ring)
    }
  }

  return rings
}

function coordsEqual(a, b) {
  if (!a || !b) return false
  return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7
}

function bboxFromGeometry(geometry) {
  const coords = flattenCoordinates(geometry)
  if (!coords.length) return [-180, -90, 180, 90]
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return [minLng, minLat, maxLng, maxLat]
}

function flattenCoordinates(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') {
    return geometry.coordinates[0] || []
  }
  if (geometry.type === 'MultiPolygon') {
    const result = []
    for (const polygon of geometry.coordinates) {
      if (polygon[0]) result.push(...polygon[0])
    }
    return result
  }
  return []
}

function isPointInsideBbox(lngLat, bbox) {
  return lngLat[0] >= bbox[0] && lngLat[0] <= bbox[2] && lngLat[1] >= bbox[1] && lngLat[1] <= bbox[3]
}

// ── Main importer ───────────────────────────────────────────

/**
 * Import a city's metro network from OpenStreetMap via Overpass API.
 *
 * @param {number} relationId  OSM relation ID for the city's admin boundary
 * @param {object} [options]
 * @param {boolean} [options.includeConstruction=false]
 * @param {boolean} [options.includeProposed=false]
 * @param {object|null} [options.boundaryGeoJson=null]  Pre-supplied boundary GeoJSON; skips boundary fetch if provided
 * @param {AbortSignal} [signal]
 * @returns {Promise<{region: object, boundary: object, stations: Array, edges: Array, lines: Array, importMeta: object}>}
 */
export async function importCityMetroNetwork(relationId, options = {}, signal, onProgress) {
  const includeConstruction = Boolean(options.includeConstruction)
  const includeProposed = Boolean(options.includeProposed)

  const report = onProgress || (() => {})

  // 1. Fetch boundary first to get bbox (bbox queries are 10-100x faster than area() on Overpass)
  report(5, '获取行政边界...')
  let boundaryGeometry = options.boundaryGeoJson || null
  if (!boundaryGeometry) {
    const boundaryPayload = await postOverpassQuery(buildBoundaryQuery(relationId), signal)
    boundaryGeometry = extractBoundaryGeometry(boundaryPayload.elements)
  }
  const bbox = boundaryGeometry ? bboxFromGeometry(boundaryGeometry) : null
  if (!bbox) throw new Error('无法获取城市边界')

  // 2. Fetch relations using bbox (fast) instead of area() (slow)
  report(15, '查询线路关系...')
  const relationsPayload = await postOverpassQuery(
    buildRelationsOnlyQuery(bbox, includeConstruction, includeProposed), signal,
  )

  // 3. Collect way IDs from relations, fetch only those ways + nodes
  const wayIdSet = new Set()
  for (const el of relationsPayload.elements) {
    if (el.type !== 'relation') continue
    for (const m of el.members || []) {
      if (m.type === 'way') wayIdSet.add(m.ref)
    }
  }

  report(25, '查询轨道几何数据...')
  const wayIds = [...wayIdSet]
  const WAY_BATCH_SIZE = 500
  const fetchPromises = []
  for (let i = 0; i < wayIds.length; i += WAY_BATCH_SIZE) {
    const q = buildWayNodesQuery(wayIds.slice(i, i + WAY_BATCH_SIZE))
    if (q) fetchPromises.push(postOverpassQuery(q, signal))
  }
  const standaloneQuery = buildStandaloneStationQuery(bbox, includeConstruction, includeProposed)
  if (standaloneQuery) {
    fetchPromises.push(postOverpassQuery(standaloneQuery, signal))
  }
  const fetchResults = await Promise.all(fetchPromises)

  report(55, '解析线路数据...')
  const elements = mergeElements([relationsPayload, ...fetchResults])
  const { nodes, ways, relations } = indexElements(elements)

  // 3. Process route relations into lines, stations, edges
  report(60, '构建站点与线段...')
  const stationByNodeId = new Map()
  const nodeIdByStationId = new Map()
  const lineByKey = new Map()
  const edgeByPairKey = new Map()
  const edgeLineIdSets = new Map()
  const lineEdgeIdSets = new Map()
  const lineStatusById = new Map()

  let lineColorIndex = 0

  // Build global adjacency graph once from all route relations
  const routeRelations = []
  for (const relation of relations) {
    const tags = relation.tags || {}
    if (tags.type !== 'route') continue
    const status = classifyRelationStatus(tags)
    if (!shouldIncludeStatus(status, includeConstruction, includeProposed)) continue
    routeRelations.push({ relation, status })
  }

  const globalAdjacency = buildGlobalAdjacency(routeRelations.map((r) => r.relation), ways, nodes)

  for (const { relation, status } of routeRelations) {
    const lineKey = toLineKey(relation)
    if (!lineByKey.has(lineKey)) {
      lineByKey.set(lineKey, createLineFromRelation(relation, lineColorIndex, status))
      lineColorIndex += 1
    } else {
      const existingLine = lineByKey.get(lineKey)
      existingLine.status = mergeLineStatus(existingLine.status, status)
    }

    const line = lineByKey.get(lineKey)
    lineStatusById.set(line.id, line.status)

    const stopNodeRefs = getOrderedStopNodeRefs(relation, ways, nodes)
      .map((ref) => Number(ref))
      .filter((ref) => nodes.has(ref))

    const stationSequence = []

    for (const nodeRef of stopNodeRefs) {
      const node = nodes.get(nodeRef)
      const lngLat = toNodeLngLat(node)

      // Filter by bbox if we have boundary info
      if (bbox && !isPointInsideBbox(lngLat, bbox)) {
        continue
      }

      if (!stationByNodeId.has(nodeRef)) {
        const names = readStationName(node)
        const station = {
          id: createId('station'),
          osmNodeId: nodeRef,
          nameZh: names.nameZh,
          nameEn: names.nameEn,
          lngLat,
          displayPos: [0, 0],
          isInterchange: false,
          underConstruction: false,
          proposed: false,
          lineIds: [],
        }
        stationByNodeId.set(nodeRef, station)
        nodeIdByStationId.set(station.id, nodeRef)
      }

      const station = stationByNodeId.get(nodeRef)
      const lastStationId = stationSequence[stationSequence.length - 1]
      if (lastStationId !== station.id) {
        stationSequence.push(station.id)
      }
    }

    for (let i = 0; i < stationSequence.length - 1; i += 1) {
      const fromStationId = stationSequence[i]
      const toStationId = stationSequence[i + 1]
      if (fromStationId === toStationId) continue

      const fromNodeId = nodeIdByStationId.get(fromStationId)
      const toNodeId = nodeIdByStationId.get(toStationId)
      if (!fromNodeId || !toNodeId) continue

      const pairKey =
        fromStationId < toStationId ? `${fromStationId}__${toStationId}` : `${toStationId}__${fromStationId}`

      if (!edgeByPairKey.has(pairKey)) {
        const nodePath = shortestPath(globalAdjacency, fromNodeId, toNodeId)
        const waypoints = []
        for (const nodeId of nodePath) {
          const node = nodes.get(nodeId)
          if (!node) continue
          waypoints.push(toNodeLngLat(node))
        }

        const fromStation = stationByNodeId.get(fromNodeId)
        const toStation = stationByNodeId.get(toNodeId)
        const fallbackWaypoints = [fromStation?.lngLat, toStation?.lngLat].filter(Boolean)
        const finalWaypoints = waypoints.length >= 2 ? waypoints : fallbackWaypoints

        edgeByPairKey.set(pairKey, {
          id: createId('edge'),
          fromStationId,
          toStationId,
          waypoints: finalWaypoints,
          sharedByLineIds: [line.id],
          lengthMeters: sumPathLength(finalWaypoints),
          isCurved: false,
        })
        edgeLineIdSets.set(pairKey, new Set([line.id]))
      } else {
        const edge = edgeByPairKey.get(pairKey)
        const lineIdSet = edgeLineIdSets.get(pairKey)
        if (!lineIdSet.has(line.id)) {
          lineIdSet.add(line.id)
          edge.sharedByLineIds.push(line.id)
        }
      }

      const edge = edgeByPairKey.get(pairKey)
      if (!lineEdgeIdSets.has(line.id)) lineEdgeIdSets.set(line.id, new Set())
      const edgeIdSet = lineEdgeIdSets.get(line.id)
      if (!edgeIdSet.has(edge.id)) {
        edgeIdSet.add(edge.id)
        line.edgeIds.push(edge.id)
      }
    }
  }

  // 4. Import standalone construction/proposed station nodes
  const subwayStationNodes = []
  for (const [nodeId, node] of nodes) {
    const tags = node?.tags || {}
    if (!isSubwayStationNode(tags)) continue
    subwayStationNodes.push([nodeId, node, tags])
  }

  for (const [nodeId, node, tags] of subwayStationNodes) {
    const status = classifyStationStatus(tags)
    if (status === 'open') continue
    if (!shouldIncludeStatus(status, includeConstruction, includeProposed)) continue
    if (stationByNodeId.has(nodeId)) continue

    const lngLat = toNodeLngLat(node)
    if (bbox && !isPointInsideBbox(lngLat, bbox)) continue

    const names = readStationName(node)
    const station = {
      id: createId('station'),
      osmNodeId: nodeId,
      nameZh: names.nameZh,
      nameEn: names.nameEn,
      lngLat,
      displayPos: [0, 0],
      isInterchange: false,
      underConstruction: status === 'construction',
      proposed: status === 'proposed',
      lineIds: [],
    }
    stationByNodeId.set(nodeId, station)
    nodeIdByStationId.set(station.id, nodeId)
  }

  // 5. Merge stations by proximity and name, compute display positions
  report(80, '合并站点拓扑...')
  const merged = mergeStationsAndTopology({
    stations: [...stationByNodeId.values()],
    edges: [...edgeByPairKey.values()],
    lines: [...lineByKey.values()],
    lineStatusById,
  })

  report(95, '生成工程数据...')
  // 6. Build region metadata
  const preset = findCityPresetByRelationId(relationId)
  const regionName = preset ? preset.name : `OSM #${relationId}`
  const regionNameEn = preset ? preset.nameEn : `OSM #${relationId}`
  const regionId = preset ? `${preset.id}_admin` : `osm_${relationId}`

  return {
    region: {
      id: regionId,
      name: regionName,
      nameEn: regionNameEn,
      relationId,
      bbox: bbox || undefined,
    },
    boundary: boundaryGeometry,
    stations: merged.stations,
    edges: merged.edges,
    lines: merged.lines,
    importMeta: {
      importedAt: new Date().toISOString(),
      includeConstruction,
      includeProposed,
      relationCount: relations.length,
      mergedStationCount: merged.stations.length,
    },
  }
}
