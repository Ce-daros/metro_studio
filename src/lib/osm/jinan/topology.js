import { haversineDistanceMeters } from '../../geo'
import {
  CROSS_LINE_MERGE_DISTANCE_METERS,
  SAME_LINE_MERGE_DISTANCE_METERS,
  STOP_ROLE_REGEX,
  VERY_CLOSE_FORCE_MERGE_METERS,
} from './constants'
import { normalizeStationName } from './naming'
import {
  UnionFind,
  buildRelationAdjacency,
  buildGlobalAdjacency,
  shortestPath,
  hasSharedLine,
  sumPathLength,
  orientWaypointsByEndpoints,
  assignCompactDisplayPositions,
  toNodeLngLat,
} from './topologyGraph'

function mergeElements(payloads) {
  const elementMap = new Map()
  for (const payload of payloads) {
    for (const element of payload.elements) {
      elementMap.set(`${element.type}/${element.id}`, element)
    }
  }
  return [...elementMap.values()]
}

function indexElements(elements) {
  const nodes = new Map()
  const ways = new Map()
  const relations = []

  for (const element of elements) {
    if (element.type === 'node') {
      nodes.set(element.id, element)
    } else if (element.type === 'way') {
      ways.set(element.id, element)
    } else if (element.type === 'relation') {
      relations.push(element)
    }
  }

  return { nodes, ways, relations }
}

function getOrderedStopNodeRefs(relation, ways, nodes) {
  const fromMembers = (relation.members || [])
    .filter((member) => member.type === 'node' && STOP_ROLE_REGEX.test(member.role || ''))
    .map((member) => member.ref)

  const uniqueRefs = new Set()
  const orderedRefs = []

  for (const ref of fromMembers) {
    if (!nodes.has(ref) || uniqueRefs.has(ref)) continue
    uniqueRefs.add(ref)
    orderedRefs.push(ref)
  }

  if (orderedRefs.length > 1) {
    return orderedRefs
  }

  for (const member of relation.members || []) {
    if (member.type !== 'way') continue
    const way = ways.get(member.ref)
    if (!way?.nodes) continue
    for (const nodeId of way.nodes) {
      const node = nodes.get(nodeId)
      const tags = node?.tags || {}
      const isStationNode =
        tags.railway === 'station' ||
        tags.station === 'subway' ||
        tags.public_transport === 'station' ||
        tags.public_transport === 'stop_position'
      if (!isStationNode) continue
      if (uniqueRefs.has(nodeId)) continue
      uniqueRefs.add(nodeId)
      orderedRefs.push(nodeId)
    }
  }

  return orderedRefs
}

function mergeStationsAndTopology({ stations, edges, lines, lineStatusById }) {
  if (!stations.length) {
    return { stations, edges, lines }
  }

  const edgeById = new Map(edges.map((edge) => [edge.id, edge]))
  const stationById = new Map(stations.map((station) => [station.id, station]))
  const stationLineSet = new Map(stations.map((station) => [station.id, new Set()]))

  for (const line of lines) {
    for (const edgeId of line.edgeIds) {
      const edge = edgeById.get(edgeId)
      if (!edge) continue
      stationLineSet.get(edge.fromStationId)?.add(line.id)
      stationLineSet.get(edge.toStationId)?.add(line.id)
    }
  }

  const uf = new UnionFind(stations.map((station) => station.id))
  const stationGroupsByName = new Map()

  for (const station of stations) {
    const key = normalizeStationName(station.nameZh)
    if (!key) continue
    if (!stationGroupsByName.has(key)) {
      stationGroupsByName.set(key, [])
    }
    stationGroupsByName.get(key).push(station)
  }

  for (const group of stationGroupsByName.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const stationA = group[i]
        const stationB = group[j]
        const lineSetA = stationLineSet.get(stationA.id)
        const lineSetB = stationLineSet.get(stationB.id)
        const sameLine = hasSharedLine(lineSetA, lineSetB)
        const threshold = sameLine ? SAME_LINE_MERGE_DISTANCE_METERS : CROSS_LINE_MERGE_DISTANCE_METERS
        const dist = haversineDistanceMeters(stationA.lngLat, stationB.lngLat)
        if (dist <= threshold) {
          uf.union(stationA.id, stationB.id)
        }
      }
    }
  }

  // Use grid-based spatial indexing to avoid O(n²) comparisons
  const gridSize = 0.01 // ~1km at equator
  const grid = new Map()

  for (const station of stations) {
    const gridKey = `${Math.floor(station.lngLat[0] / gridSize)},${Math.floor(station.lngLat[1] / gridSize)}`
    if (!grid.has(gridKey)) {
      grid.set(gridKey, [])
    }
    grid.get(gridKey).push(station)
  }

  const checkedPairs = new Set()
  for (const [gridKey, cellStations] of grid.entries()) {
    const [gx, gy] = gridKey.split(',').map(Number)

    // Check within cell
    for (let i = 0; i < cellStations.length; i += 1) {
      for (let j = i + 1; j < cellStations.length; j += 1) {
        const stationA = cellStations[i]
        const stationB = cellStations[j]
        const dist = haversineDistanceMeters(stationA.lngLat, stationB.lngLat)
        if (dist <= VERY_CLOSE_FORCE_MERGE_METERS) {
          uf.union(stationA.id, stationB.id)
        }
      }
    }

    // Check adjacent cells
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue
        const neighborKey = `${gx + dx},${gy + dy}`
        const neighborStations = grid.get(neighborKey)
        if (!neighborStations) continue

        for (const stationA of cellStations) {
          for (const stationB of neighborStations) {
            const pairKey = stationA.id < stationB.id ? `${stationA.id}:${stationB.id}` : `${stationB.id}:${stationA.id}`
            if (checkedPairs.has(pairKey)) continue
            checkedPairs.add(pairKey)

            const dist = haversineDistanceMeters(stationA.lngLat, stationB.lngLat)
            if (dist <= VERY_CLOSE_FORCE_MERGE_METERS) {
              uf.union(stationA.id, stationB.id)
            }
          }
        }
      }
    }
  }

  const rootToStations = new Map()
  for (const station of stations) {
    const root = uf.find(station.id)
    if (!rootToStations.has(root)) {
      rootToStations.set(root, [])
    }
    rootToStations.get(root).push(station)
  }

  const oldStationIdToNewStationId = new Map()
  const mergedStations = []

  for (const groupedStations of rootToStations.values()) {
    let sumLng = 0
    let sumLat = 0
    const allLineIds = new Set()
    let baseStation = groupedStations[0]

    for (const station of groupedStations) {
      sumLng += station.lngLat[0]
      sumLat += station.lngLat[1]
      if (normalizeStationName(station.nameZh).length > normalizeStationName(baseStation.nameZh).length) {
        baseStation = station
      }
      for (const lineId of stationLineSet.get(station.id) || []) {
        allLineIds.add(lineId)
      }
    }

    const mergedStationId = baseStation.id
    for (const station of groupedStations) {
      oldStationIdToNewStationId.set(station.id, mergedStationId)
    }

    const lineIds = [...allLineIds]
    const explicitUnderConstruction = groupedStations.some((station) => Boolean(station.underConstruction))
    const explicitProposed = groupedStations.some((station) => Boolean(station.proposed))
    const derivedUnderConstruction = lineIds.some((lineId) => lineStatusById.get(lineId) === 'construction')
    const derivedProposed = lineIds.some((lineId) => lineStatusById.get(lineId) === 'proposed')
    const station = {
      id: mergedStationId,
      nameZh: baseStation.nameZh,
      nameEn: baseStation.nameEn,
      lngLat: [sumLng / groupedStations.length, sumLat / groupedStations.length],
      displayPos: [0, 0],
      isInterchange: lineIds.length > 1,
      underConstruction: lineIds.length > 0 ? derivedUnderConstruction : explicitUnderConstruction,
      proposed: lineIds.length > 0 ? derivedProposed : explicitProposed,
      lineIds,
    }

    mergedStations.push(station)
  }

  const mergedStationById = new Map(mergedStations.map((station) => [station.id, station]))
  const oldEdgeIdToNewEdgeId = new Map()
  const edgeByPair = new Map()

  for (const edge of edges) {
    const fromStationId = oldStationIdToNewStationId.get(edge.fromStationId)
    const toStationId = oldStationIdToNewStationId.get(edge.toStationId)
    if (!fromStationId || !toStationId || fromStationId === toStationId) continue

    const pairKey =
      fromStationId < toStationId ? `${fromStationId}__${toStationId}` : `${toStationId}__${fromStationId}`

    const fromStation = mergedStationById.get(fromStationId)
    const toStation = mergedStationById.get(toStationId)
    if (!fromStation || !toStation) continue

    const baseWaypoints =
      Array.isArray(edge.waypoints) && edge.waypoints.length >= 2 ? edge.waypoints.map((w) => [...w]) : []

    const candidateWaypoints = baseWaypoints.length ? baseWaypoints : [fromStation.lngLat, toStation.lngLat]
    const waypoints = orientWaypointsByEndpoints(candidateWaypoints, fromStation.lngLat, toStation.lngLat)
    const lengthMeters = sumPathLength(waypoints)

    if (!edgeByPair.has(pairKey)) {
      const lineIdSet = new Set(edge.sharedByLineIds || [])
      const mergedEdge = {
        id: edge.id,
        fromStationId,
        toStationId,
        waypoints,
        _lineIdSet: lineIdSet,
        sharedByLineIds: [...lineIdSet],
        lengthMeters,
        isCurved: false,
      }
      edgeByPair.set(pairKey, mergedEdge)
      oldEdgeIdToNewEdgeId.set(edge.id, mergedEdge.id)
    } else {
      const mergedEdge = edgeByPair.get(pairKey)
      for (const lineId of edge.sharedByLineIds || []) {
        if (!mergedEdge._lineIdSet.has(lineId)) {
          mergedEdge._lineIdSet.add(lineId)
          mergedEdge.sharedByLineIds.push(lineId)
        }
      }
      if (lengthMeters < mergedEdge.lengthMeters) {
        mergedEdge.waypoints = waypoints
        mergedEdge.lengthMeters = lengthMeters
      }
      oldEdgeIdToNewEdgeId.set(edge.id, mergedEdge.id)
    }
  }

  const mergedEdges = [...edgeByPair.values()]
  for (const edge of mergedEdges) delete edge._lineIdSet

  const mergedLines = lines
    .map((line) => {
      const edgeIds = [...new Set(line.edgeIds.map((edgeId) => oldEdgeIdToNewEdgeId.get(edgeId)).filter(Boolean))]
      return {
        ...line,
        edgeIds,
      }
    })
    .filter((line) => line.edgeIds.length > 0)

  const mergedStationLineSet = new Map(mergedStations.map((station) => [station.id, new Set()]))
  const mergedEdgeById = new Map(mergedEdges.map((edge) => [edge.id, edge]))
  for (const line of mergedLines) {
    for (const edgeId of line.edgeIds) {
      const edge = mergedEdgeById.get(edgeId)
      if (!edge) continue
      mergedStationLineSet.get(edge.fromStationId)?.add(line.id)
      mergedStationLineSet.get(edge.toStationId)?.add(line.id)
    }
  }

  for (const station of mergedStations) {
    const previousUnderConstruction = Boolean(station.underConstruction)
    const previousProposed = Boolean(station.proposed)
    const lineIds = [...(mergedStationLineSet.get(station.id) || [])]
    station.lineIds = lineIds
    station.isInterchange = lineIds.length > 1
    if (lineIds.length > 0) {
      station.underConstruction = lineIds.some((lineId) => lineStatusById.get(lineId) === 'construction')
      station.proposed = lineIds.some((lineId) => lineStatusById.get(lineId) === 'proposed')
      continue
    }
    station.underConstruction = previousUnderConstruction
    station.proposed = previousProposed
  }

  assignCompactDisplayPositions(mergedStations)

  return {
    stations: mergedStations,
    edges: mergedEdges,
    lines: mergedLines,
  }
}

export {
  mergeElements,
  indexElements,
  toNodeLngLat,
  getOrderedStopNodeRefs,
  buildRelationAdjacency,
  buildGlobalAdjacency,
  shortestPath,
  sumPathLength,
  mergeStationsAndTopology,
}
