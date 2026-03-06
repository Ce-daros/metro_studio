import {
  buildEdgeSpatialGrid,
  buildSpatialGrid,
  clamp,
  boxesOverlap,
  distance,
  edgesShareEndpoint,
  forEachNeighborBucket,
  gridCellKey,
  interpolateAngles,
  lerp,
  normalizePositiveAngle,
  projectPointToLine,
  segmentBox,
  segmentsIntersect,
  snapAngle,
  toGridCellCoord,
  toFiniteNumber,
} from './shared'

function normalizeSeedPositions(stations, targetSpan, geoSeedScale = 1) {
  const raw = stations.map((station) => {
    if (Array.isArray(station.lngLat) && station.lngLat.length === 2) {
      return [toFiniteNumber(station.lngLat[0]), toFiniteNumber(station.lngLat[1])]
    }
    if (Array.isArray(station.displayPos) && station.displayPos.length === 2) {
      return [toFiniteNumber(station.displayPos[0]), toFiniteNumber(station.displayPos[1])]
    }
    return [0, 0]
  })

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const [x, y] of raw) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const seedScale = Math.max(0.1, toFiniteNumber(geoSeedScale, 1))
  const scale = (targetSpan * seedScale) / Math.max(width, height)

  return raw.map(([x, y]) => [(x - minX) * scale, (y - minY) * scale])
}

function estimateDesiredEdgeLength(baseLength, config) {
  const safeBaseLength = toFiniteNumber(baseLength)
  const linearCompressed = 34 + Math.min(safeBaseLength, 280) * 0.2
  return clamp(linearCompressed, config.minEdgeLength, config.maxEdgeLength)
}

function applyAnchorForce(forces, positions, original, config) {
  if (!positions || !original || positions.length !== original.length) return
  for (let i = 0; i < positions.length; i += 1) {
    const dx = original[i][0] - positions[i][0]
    const dy = original[i][1] - positions[i][1]
    forces[i][0] += dx * config.anchorWeight
    forces[i][1] += dy * config.anchorWeight
  }
}

function applySpringAndAngleForce(forces, positions, original, edgeRecords, config) {
  for (const edge of edgeRecords) {
    const a = positions[edge.fromIndex]
    const b = positions[edge.toIndex]

    if (!a || !b || edge.fromIndex == null || edge.toIndex == null) continue

    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const length = Math.max(distance(a, b), 0.00001)
    const ux = dx / length
    const uy = dy / length

    const springDelta = length - edge.desiredLength
    const springForce = springDelta * config.springWeight

    forces[edge.fromIndex][0] += ux * springForce
    forces[edge.fromIndex][1] += uy * springForce
    forces[edge.toIndex][0] -= ux * springForce
    forces[edge.toIndex][1] -= uy * springForce

    const snappedAngle = snapAngle(Math.atan2(dy, dx))
    const geoAngle = snapAngle(
      Math.atan2(
        original[edge.toIndex][1] - original[edge.fromIndex][1],
        original[edge.toIndex][0] - original[edge.fromIndex][0],
      ),
    )
    const preferredAngle = interpolateAngles(snappedAngle, geoAngle, config.geoAngleBias)
    const desiredDx = Math.cos(preferredAngle) * length
    const desiredDy = Math.sin(preferredAngle) * length
    const isCardinal = Math.abs(snappedAngle % (Math.PI / 2)) < 0.01
    const cardinalBoost = isCardinal ? 1.35 : 1
    const angleCorrectionX = (desiredDx - dx) * config.angleWeight * cardinalBoost
    const angleCorrectionY = (desiredDy - dy) * config.angleWeight * cardinalBoost

    forces[edge.fromIndex][0] -= angleCorrectionX
    forces[edge.fromIndex][1] -= angleCorrectionY
    forces[edge.toIndex][0] += angleCorrectionX
    forces[edge.toIndex][1] += angleCorrectionY
  }
}

function applyRepulsionForce(forces, positions, config) {
  const { grid, cellSize } = buildSpatialGrid(positions, config.minStationDistance * 1.6)

  for (let i = 0; i < positions.length; i += 1) {
    const [x, y] = positions[i]
    const baseX = toGridCellCoord(x, cellSize)
    const baseY = toGridCellCoord(y, cellSize)

    forEachNeighborBucket(grid, baseX, baseY, (bucket) => {
      for (const j of bucket) {
        if (i >= j) continue
        const dx = positions[j][0] - positions[i][0]
        const dy = positions[j][1] - positions[i][1]
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.00001)
        if (d >= config.minStationDistance * 2.5) continue
        const strength = (config.repulsionWeight / (d * d)) * 0.023
        const ux = dx / d
        const uy = dy / d
        forces[i][0] -= ux * strength
        forces[i][1] -= uy * strength
        forces[j][0] += ux * strength
        forces[j][1] += uy * strength
      }
    })
  }
}

function buildAdjacency(nodeCount, edgeRecords) {
  const adjacency = Array.from({ length: nodeCount }, () => [])
  for (const edge of edgeRecords) {
    adjacency[edge.fromIndex].push(edge.toIndex)
    adjacency[edge.toIndex].push(edge.fromIndex)
  }
  return adjacency
}

function applyJunctionSpread(forces, positions, adjacency, nodeDegrees, config) {
  for (let center = 0; center < adjacency.length; center += 1) {
    const neighbors = adjacency[center]
    if (!neighbors || neighbors.length < 3) continue

    const centerPoint = positions[center]
    if (!centerPoint) continue

    const vectors = neighbors
      .map((neighbor) => {
        const p = positions[neighbor]
        if (!p) return null
        const dx = p[0] - centerPoint[0]
        const dy = p[1] - centerPoint[1]
        const length = Math.max(Math.hypot(dx, dy), 0.00001)
        return {
          neighbor,
          ux: dx / length,
          uy: dy / length,
          angle: Math.atan2(dy, dx),
        }
      })
      .filter(v => v !== null)
      .sort((a, b) => a.angle - b.angle)

    for (let i = 0; i < vectors.length; i += 1) {
      const current = vectors[i]
      const next = vectors[(i + 1) % vectors.length]
      const gap = normalizePositiveAngle(next.angle - current.angle)
      if (gap >= Math.PI / 4.4) continue

      const overlap = Math.PI / 4.4 - gap
      const strength = overlap * 0.38
      const centerBoost = nodeDegrees[center] >= 4 ? 1.16 : 1

      const normalCurrent = [-current.uy, current.ux]
      const normalNext = [next.uy, -next.ux]

      forces[current.neighbor][0] += normalCurrent[0] * strength * config.junctionSpreadWeight * centerBoost
      forces[current.neighbor][1] += normalCurrent[1] * strength * config.junctionSpreadWeight * centerBoost
      forces[next.neighbor][0] += normalNext[0] * strength * config.junctionSpreadWeight * centerBoost
      forces[next.neighbor][1] += normalNext[1] * strength * config.junctionSpreadWeight * centerBoost

      forces[center][0] -= (normalCurrent[0] + normalNext[0]) * strength * 0.3
      forces[center][1] -= (normalCurrent[1] + normalNext[1]) * strength * 0.3
    }
  }
}

function applyCrossingRepel(forces, positions, edgeRecords, config) {
  const cellSize = (config.maxEdgeLength || 80) * 1.5
  const { grid } = buildEdgeSpatialGrid(positions, edgeRecords, cellSize)
  const checked = new Set()

  for (let i = 0; i < edgeRecords.length; i += 1) {
    const e1 = edgeRecords[i]
    const a1 = positions[e1.fromIndex]
    const a2 = positions[e1.toIndex]
    if (!a1 || !a2) continue
    const aBox = segmentBox(a1, a2)

    const minCX = Math.floor(Math.min(a1[0], a2[0]) / cellSize)
    const maxCX = Math.floor(Math.max(a1[0], a2[0]) / cellSize)
    const minCY = Math.floor(Math.min(a1[1], a2[1]) / cellSize)
    const maxCY = Math.floor(Math.max(a1[1], a2[1]) / cellSize)

    for (let cx = minCX; cx <= maxCX; cx += 1) {
      for (let cy = minCY; cy <= maxCY; cy += 1) {
        const bucket = grid.get(gridCellKey(cx, cy))
        if (!bucket) continue
        for (const j of bucket) {
          if (j <= i) continue
          const pairKey = i * edgeRecords.length + j
          if (checked.has(pairKey)) continue
          checked.add(pairKey)

          const e2 = edgeRecords[j]
          if (edgesShareEndpoint(e1, e2)) continue
          const b1 = positions[e2.fromIndex]
          const b2 = positions[e2.toIndex]
          if (!b1 || !b2) continue
          if (!boxesOverlap(aBox, segmentBox(b1, b2))) continue
          if (!segmentsIntersect(a1, a2, b1, b2)) continue

          const dx = (b1[0] + b2[0]) * 0.5 - (a1[0] + a2[0]) * 0.5
          const dy = (b1[1] + b2[1]) * 0.5 - (a1[1] + a2[1]) * 0.5
          const d = Math.max(Math.hypot(dx, dy), 0.00001)
          const push = config.crossingRepelWeight * 0.032
          applyCrossingPush(forces || positions, e1, e2, dx / d, dy / d, forces ? push : push * 0.2)
        }
      }
    }
  }
}

function applyCrossingPush(target, edgeA, edgeB, ux, uy, amount) {
  shiftNode(target, edgeA.fromIndex, -ux * amount, -uy * amount)
  shiftNode(target, edgeA.toIndex, -ux * amount, -uy * amount)
  shiftNode(target, edgeB.fromIndex, ux * amount, uy * amount)
  shiftNode(target, edgeB.toIndex, ux * amount, uy * amount)
}

function shiftNode(target, index, deltaX, deltaY) {
  if (!target || !target[index]) return
  target[index][0] += deltaX
  target[index][1] += deltaY
}

function clampDisplacement(positions, original, maxDisplacement) {
  if (!Number.isFinite(maxDisplacement) || maxDisplacement <= 0) return
  for (let i = 0; i < positions.length; i += 1) {
    if (!positions[i] || !original[i]) continue
    const dx = positions[i][0] - original[i][0]
    const dy = positions[i][1] - original[i][1]
    const d = Math.hypot(dx, dy)
    if (d <= maxDisplacement) continue
    const ratio = maxDisplacement / d
    positions[i][0] = original[i][0] + dx * ratio
    positions[i][1] = original[i][1] + dy * ratio
  }
}

function snapEdgesToEightDirections(positions, edgeRecords, ratio) {
  for (const edge of edgeRecords) {
    const from = positions[edge.fromIndex]
    const to = positions[edge.toIndex]

    if (!from || !to) continue

    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const length = distance(from, to)
    if (!length) continue
    const snapped = snapAngle(Math.atan2(dy, dx))
    const targetDx = Math.cos(snapped) * length
    const targetDy = Math.sin(snapped) * length
    const correctionX = (targetDx - dx) * ratio
    const correctionY = (targetDy - dy) * ratio
    from[0] -= correctionX
    from[1] -= correctionY
    to[0] += correctionX
    to[1] += correctionY
  }
}

function straightenNearLinearSegments(positions, edgeRecords, lines, stations, config) {
  const edgeById = new Map(edgeRecords.map((edge) => [edge.id, edge]))
  const turnTolerance = (config.straightenTurnToleranceDeg * Math.PI) / 180

  for (const line of lines || []) {
    const adjacency = new Map()
    for (const edgeId of line.edgeIds || []) {
      const edge = edgeById.get(edgeId)
      if (!edge) continue
      addNeighbor(adjacency, edge.fromIndex, edge.toIndex)
      addNeighbor(adjacency, edge.toIndex, edge.fromIndex)
    }

    for (let pass = 0; pass < 2; pass += 1) {
      for (const [centerIndex, neighbors] of adjacency.entries()) {
        if (neighbors.size !== 2) continue
        if ((stations[centerIndex]?.lineIds?.length || 0) > 1) continue
        const [leftIndex, rightIndex] = [...neighbors]
        const center = positions[centerIndex]
        const left = positions[leftIndex]
        const right = positions[rightIndex]

        const v1 = [left[0] - center[0], left[1] - center[1]]
        const v2 = [right[0] - center[0], right[1] - center[1]]
        const len1 = Math.max(Math.hypot(v1[0], v1[1]), 0.00001)
        const len2 = Math.max(Math.hypot(v2[0], v2[1]), 0.00001)

        const cosTheta = clamp((v1[0] * v2[0] + v1[1] * v2[1]) / (len1 * len2), -1, 1)
        const angle = Math.acos(cosTheta)
        const turn = Math.abs(Math.PI - angle)

        if (turn > turnTolerance) continue

        const projected = projectPointToLine(center, left, right)
        center[0] = lerp(center[0], projected[0], config.straightenStrength)
        center[1] = lerp(center[1], projected[1], config.straightenStrength)
      }
    }
  }
}

function compactLongEdges(positions, edgeRecords, maxLength) {
  for (const edge of edgeRecords) {
    const from = positions[edge.fromIndex]
    const to = positions[edge.toIndex]
    const length = distance(from, to)
    if (length <= maxLength) continue
    const target = maxLength
    const ratio = (length - target) / length
    const moveX = (to[0] - from[0]) * ratio * 0.5
    const moveY = (to[1] - from[1]) * ratio * 0.5
    from[0] += moveX
    from[1] += moveY
    to[0] -= moveX
    to[1] -= moveY
  }
}

function buildNodeDegrees(nodeCount, edgeRecords) {
  const degrees = new Array(nodeCount).fill(0)
  for (const edge of edgeRecords) {
    degrees[edge.fromIndex] += 1
    degrees[edge.toIndex] += 1
  }
  return degrees
}

function addNeighbor(adjacency, from, to) {
  if (!adjacency.has(from)) adjacency.set(from, new Set())
  adjacency.get(from).add(to)
}

function pointToSegmentDistance(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1]]
  const ap = [p[0] - a[0], p[1] - a[1]]
  const abLenSq = ab[0] * ab[0] + ab[1] * ab[1]
  
  if (abLenSq === 0) return Math.hypot(ap[0], ap[1])
  
  let t = (ap[0] * ab[0] + ap[1] * ab[1]) / abLenSq
  t = Math.max(0, Math.min(1, t))
  
  const closest = [a[0] + ab[0] * t, a[1] + ab[1] * t]
  return Math.hypot(p[0] - closest[0], p[1] - closest[1])
}

function segmentDistance(a1, a2, b1, b2) {
  let minDist = Infinity
  minDist = Math.min(minDist, pointToSegmentDistance(a1, b1, b2))
  minDist = Math.min(minDist, pointToSegmentDistance(a2, b1, b2))
  minDist = Math.min(minDist, pointToSegmentDistance(b1, a1, a2))
  minDist = Math.min(minDist, pointToSegmentDistance(b2, a1, a2))
  return minDist
}

function applyProximityRepel(forces, positions, edgeRecords, config) {
  const maxDistance = config.proximityRepelMaxDistance || 22
  const target = forces || positions
  const cellSize = maxDistance * 3
  const { grid } = buildEdgeSpatialGrid(positions, edgeRecords, cellSize)
  const checked = new Set()

  for (let i = 0; i < edgeRecords.length; i++) {
    const e1 = edgeRecords[i]
    const a1 = positions[e1.fromIndex]
    const a2 = positions[e1.toIndex]
    if (!a1 || !a2) continue

    const minCX = Math.floor(Math.min(a1[0], a2[0]) / cellSize)
    const maxCX = Math.floor(Math.max(a1[0], a2[0]) / cellSize)
    const minCY = Math.floor(Math.min(a1[1], a2[1]) / cellSize)
    const maxCY = Math.floor(Math.max(a1[1], a2[1]) / cellSize)

    for (let cx = minCX; cx <= maxCX; cx += 1) {
      for (let cy = minCY; cy <= maxCY; cy += 1) {
        const bucket = grid.get(gridCellKey(cx, cy))
        if (!bucket) continue
        for (const j of bucket) {
          if (j <= i) continue
          const pairKey = i * edgeRecords.length + j
          if (checked.has(pairKey)) continue
          checked.add(pairKey)

          const e2 = edgeRecords[j]
          if (edgesShareEndpoint(e1, e2)) continue
          const b1 = positions[e2.fromIndex]
          const b2 = positions[e2.toIndex]
          if (!b1 || !b2) continue

          const minDist = segmentDistance(a1, a2, b1, b2)
          if (minDist >= maxDistance) continue

          const dx = (b1[0] + b2[0]) * 0.5 - (a1[0] + a2[0]) * 0.5
          const dy = (b1[1] + b2[1]) * 0.5 - (a1[1] + a2[1]) * 0.5
          const d = Math.max(Math.hypot(dx, dy), 0.00001)
          const force = (maxDistance - minDist) * config.proximityRepelWeight
          const scaledForce = forces ? force : force * 0.2
          const ux = dx / d
          const uy = dy / d

          target[e1.fromIndex][0] -= ux * scaledForce * 0.5
          target[e1.fromIndex][1] -= uy * scaledForce * 0.5
          target[e1.toIndex][0] -= ux * scaledForce * 0.5
          target[e1.toIndex][1] -= uy * scaledForce * 0.5
          target[e2.fromIndex][0] += ux * scaledForce * 0.5
          target[e2.fromIndex][1] += uy * scaledForce * 0.5
          target[e2.toIndex][0] += ux * scaledForce * 0.5
          target[e2.toIndex][1] += uy * scaledForce * 0.5
        }
      }
    }
  }
}


export { normalizeSeedPositions, estimateDesiredEdgeLength, applyAnchorForce, applySpringAndAngleForce, applyRepulsionForce, buildAdjacency, applyJunctionSpread, applyCrossingRepel, clampDisplacement, snapEdgesToEightDirections, straightenNearLinearSegments, compactLongEdges, buildNodeDegrees, applyProximityRepel }
