import { DEFAULT_CONFIG } from './config'
import {
  applyAnchorForce,
  applyCrossingRepel,
  applyJunctionSpread,
  applyProximityRepel,
  applyRepulsionForce,
  applySpringAndAngleForce,
  buildAdjacency,
  buildNodeDegrees,
  clampDisplacement,
  compactLongEdges,
  estimateDesiredEdgeLength,
  normalizeSeedPositions,
  snapEdgesToEightDirections,
  straightenNearLinearSegments,
} from './forces'
import { enforceMinEdgeLength, enforceMinStationSpacing, enforceOctilinearHardConstraints } from './constraints'
import { computeStationLabelLayout } from './labels'
import { buildLineChains } from './linePlanning'
import { computeScoreBreakdown, sanitizeBreakdown } from './scoring'
import { angleToDirectionIndex, distance, toFiniteNumber } from './shared'

function optimizeLayout(payload) {
  const startedAt = performance.now()
  const stations = payload?.stations || []
  const edges = payload?.edges || []
  const lines = payload?.lines || []
  const config = { ...DEFAULT_CONFIG, ...(payload?.config || {}) }

  if (!stations.length || !edges.length) {
    return {
      stations,
      score: 0,
      breakdown: {
        angle: 0,
        length: 0,
        overlap: 0,
        crossing: 0,
        bend: 0,
        shortRun: 0,
        geoDeviation: 0,
        labelOverlap: 0,
      },
      elapsedMs: performance.now() - startedAt,
    }
  }

  const stationIndex = new Map()
  stations.forEach((station, index) => {
    if (!station?.id) return
    stationIndex.set(station.id, index)
  })

  const original = normalizeSeedPositions(stations, config.normalizeTargetSpan, config.geoSeedScale)

  const edgeRecords = []
  for (const edge of edges) {
    const fromIndex = stationIndex.get(edge.fromStationId)
    const toIndex = stationIndex.get(edge.toStationId)
    if (fromIndex == null || toIndex == null || fromIndex === toIndex) {
      continue
    }

    const baseLength = distance(original[fromIndex], original[toIndex])
    const desiredLength = estimateDesiredEdgeLength(baseLength, config)

    edgeRecords.push({
      id: edge.id,
      fromIndex,
      toIndex,
      desiredLength,
    })
  }
  const edgeById = new Map(edgeRecords.map((edge) => [edge.id, edge]))
  const nodeDegrees = buildNodeDegrees(stations.length, edgeRecords)
  const lineChains = buildLineChains(lines, edgeById)
  const adjacency = buildAdjacency(stations.length, edgeRecords)

  const positions = original.map((xy) => {
    if (!xy || !Array.isArray(xy)) return [0, 0]
    return [...xy]
  })

  let temperature = config.initialTemperature

  for (let iteration = 0; iteration < config.maxIterations; iteration += 1) {
    const forces = positions.map(() => [0, 0])

    applyAnchorForce(forces, positions, original, config)
    applySpringAndAngleForce(forces, positions, original, edgeRecords, config)
    applyRepulsionForce(forces, positions, config)
    applyJunctionSpread(forces, positions, adjacency, nodeDegrees, config)
    applyProximityRepel(forces, positions, edgeRecords, config)
    if ((iteration + 1) % 14 === 0) {
      applyCrossingRepel(forces, positions, edgeRecords, config)
    }

    const step = 0.12 * temperature
    for (let i = 0; i < positions.length; i += 1) {
      if (!positions[i] || !Array.isArray(positions[i]) || positions[i].length < 2) {
        positions[i] = [0, 0]
      }
      if (!original[i] || !Array.isArray(original[i]) || original[i].length < 2) {
        original[i] = [0, 0]
      }
      positions[i][0] += forces[i][0] * step
      positions[i][1] += forces[i][1] * step
    }

    clampDisplacement(positions, original, config.displacementLimit)
    temperature *= config.cooling
  }

  snapEdgesToEightDirections(positions, edgeRecords, 0.18)
  straightenNearLinearSegments(positions, edgeRecords, lines, stations, config)
  compactLongEdges(positions, edgeRecords, config.maxEdgeLength * 1.12)
  snapEdgesToEightDirections(positions, edgeRecords, 0.24)
  enforceOctilinearHardConstraints(positions, edgeRecords, stations, config)
  clampDisplacement(positions, original, config.displacementLimit)

  for (let i = 0; i < positions.length; i += 1) {
    if (!positions[i] || !Array.isArray(positions[i]) || positions[i].length < 2) {
      positions[i] = [0, 0]
    }
  }
  applyCrossingRepel(null, positions, edgeRecords, config)
  clampDisplacement(positions, original, config.displacementLimit)
  const proximityRepelPasses = Math.max(1, Math.floor(config.proximityRepelPasses || 2))
  for (let pass = 0; pass < proximityRepelPasses; pass += 1) {
    applyProximityRepel(null, positions, edgeRecords, config)
    clampDisplacement(positions, original, config.displacementLimit)
  }
  const strictOctilinearConfig = {
    ...config,
    octilinearRelaxIterations: 0,
    octilinearExactPasses: Math.max(1, Math.floor(config.octilinearFinalExactPasses || 1)),
    octilinearStrictTolerance: toFiniteNumber(config.octilinearStrictTolerance, 0.0008),
  }
  enforceOctilinearHardConstraints(positions, edgeRecords, stations, strictOctilinearConfig)
  const spacingRefineCycles = Math.max(1, Math.floor(config.stationSpacingRefineCycles || 1))
  for (let cycle = 0; cycle < spacingRefineCycles; cycle += 1) {
    enforceMinEdgeLength(positions, edgeRecords, stations, nodeDegrees, config)
    enforceMinStationSpacing(positions, stations, edgeRecords, nodeDegrees, config)
    enforceOctilinearHardConstraints(positions, edgeRecords, stations, strictOctilinearConfig)
  }
  clampDisplacement(positions, original, config.displacementLimit)

  const stationLabels = computeStationLabelLayout(positions, stations, edgeRecords, nodeDegrees, config)
  const edgeDirections = Object.fromEntries(
    edgeRecords.map((edge) => {
      const from = positions[edge.fromIndex]
      const to = positions[edge.toIndex]
      return [edge.id, angleToDirectionIndex(Math.atan2(to[1] - from[1], to[0] - from[0]))]
    }),
  )

  const breakdown = computeScoreBreakdown(
    positions,
    original,
    edgeRecords,
    lineChains,
    stations,
    stationLabels,
    config,
  )
  const safeBreakdown = sanitizeBreakdown(breakdown)
  const score = Object.values(safeBreakdown).reduce((sum, value) => sum + value, 0)

  const nextStations = stations.map((station, index) => ({
    ...station,
    displayPos: positions[index],
  }))

  return {
    stations: nextStations,
    score: toFiniteNumber(score),
    breakdown: safeBreakdown,
    layoutMeta: {
      stationLabels,
      edgeDirections,
    },
    elapsedMs: performance.now() - startedAt,
  }
}

export { optimizeLayout }
