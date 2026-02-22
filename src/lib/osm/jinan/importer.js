import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'
import { createId } from '../../ids'
const JINAN_RELATION_ID = 3486449
import { postOverpassQuery } from '../overpassClient'
import {
  CONSTRUCTION_ROUTE_QUERY,
  OPEN_ROUTE_QUERY,
  PROPOSED_ROUTE_QUERY,
  boundaryBbox,
  boundaryFeature,
  buildStandaloneStationQuery,
} from './constants'
import { createLineFromRelation, readStationName, toLineKey } from './naming'
import {
  classifyRelationStatus,
  classifyStationStatus,
  isSubwayStationNode,
  mergeLineStatus,
  shouldIncludeStatus,
} from './status'
import {
  buildGlobalAdjacency,
  getOrderedStopNodeRefs,
  indexElements,
  mergeElements,
  mergeStationsAndTopology,
  shortestPath,
  sumPathLength,
  toNodeLngLat,
} from './topology'

function isInsideJinan(lngLat) {
  return booleanPointInPolygon(point(lngLat), boundaryFeature)
}

async function importJinanMetroFromOsm(options, signal) {
  const includeConstruction = false
  const includeProposed = false

  const queries = [OPEN_ROUTE_QUERY]
  if (includeConstruction) {
    queries.push(CONSTRUCTION_ROUTE_QUERY)
  }
  if (includeProposed) {
    queries.push(PROPOSED_ROUTE_QUERY)
  }
  const standaloneStationQuery = buildStandaloneStationQuery(includeConstruction, includeProposed)
  if (standaloneStationQuery) {
    queries.push(standaloneStationQuery)
  }

  const payloads = []
  for (const query of queries) {
    payloads.push(await postOverpassQuery(query, signal))
  }

  const elements = mergeElements(payloads)
  const { nodes, ways, relations } = indexElements(elements)

  const stationByNodeId = new Map()
  const nodeIdByStationId = new Map()
  const lineByKey = new Map()
  const edgeByPairKey = new Map()
  const lineStatusById = new Map()

  let lineColorIndex = 0

  // Build global adjacency graph once instead of per-relation
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
      if (!isInsideJinan(lngLat)) {
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
      } else {
        const edge = edgeByPairKey.get(pairKey)
        if (!edge.sharedByLineIds.includes(line.id)) {
          edge.sharedByLineIds.push(line.id)
        }
      }

      const edge = edgeByPairKey.get(pairKey)
      if (!line.edgeIds.includes(edge.id)) {
        line.edgeIds.push(edge.id)
      }
    }
  }

  // Some under-construction/proposed metro stations are mapped as standalone station nodes
  // and are not yet connected to route relations. Import them only when the corresponding
  // status switches are enabled.
  for (const [nodeId, node] of nodes) {
    const tags = node?.tags || {}
    if (!isSubwayStationNode(tags)) continue

    const status = classifyStationStatus(tags)
    if (status === 'open') continue
    if (!shouldIncludeStatus(status, includeConstruction, includeProposed)) continue
    if (stationByNodeId.has(nodeId)) continue

    const lngLat = toNodeLngLat(node)
    if (!isInsideJinan(lngLat)) continue

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

  const merged = mergeStationsAndTopology({
    stations: [...stationByNodeId.values()],
    edges: [...edgeByPairKey.values()],
    lines: [...lineByKey.values()],
    lineStatusById,
  })

  return {
    region: {
      id: 'jinan_admin',
      name: '济南市',
      relationId: JINAN_RELATION_ID,
      bbox: boundaryBbox,
    },
    boundary: boundaryFeature.geometry,
    stations: merged.stations,
    edges: merged.edges,
    lines: merged.lines,
  }
}

export { importJinanMetroFromOsm }
