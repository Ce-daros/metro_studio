import {
  buildSpatialGrid,
  clamp,
  directionIndexToAngle,
  distance,
  forEachNeighborBucket,
  lerp,
  snapAngle,
  toFiniteNumber,
  toGridCellCoord,
} from './shared'
import { snapEdgesToEightDirections } from './forces'

function enforceOctilinearHardConstraints(positions, edgeRecords, stations, config) {
  if (!edgeRecords.length) return

  const degree = new Array(positions.length).fill(0)
  for (const edge of edgeRecords) {
    degree[edge.fromIndex] += 1
    degree[edge.toIndex] += 1
  }

  const relaxIterations = Math.max(0, Math.floor(config.octilinearRelaxIterations || 0))
  for (let iteration = 0; iteration < relaxIterations; iteration += 1) {
    const targets = positions.map(() => [0, 0, 0])

    for (const edge of edgeRecords) {
      const from = positions[edge.fromIndex]
      const to = positions[edge.toIndex]
      const dx = to[0] - from[0]
      const dy = to[1] - from[1]
      const length = Math.max(distance(from, to), 0.00001)
      const snapped = snapAngle(Math.atan2(dy, dx))

      const targetDx = Math.cos(snapped) * length
      const targetDy = Math.sin(snapped) * length
      const midX = (from[0] + to[0]) * 0.5
      const midY = (from[1] + to[1]) * 0.5
      const fromTarget = [midX - targetDx * 0.5, midY - targetDy * 0.5]
      const toTarget = [midX + targetDx * 0.5, midY + targetDy * 0.5]

      const fromWeight = 1 / Math.max(degree[edge.fromIndex], 1)
      const toWeight = 1 / Math.max(degree[edge.toIndex], 1)

      targets[edge.fromIndex][0] += fromTarget[0] * fromWeight
      targets[edge.fromIndex][1] += fromTarget[1] * fromWeight
      targets[edge.fromIndex][2] += fromWeight

      targets[edge.toIndex][0] += toTarget[0] * toWeight
      targets[edge.toIndex][1] += toTarget[1] * toWeight
      targets[edge.toIndex][2] += toWeight
    }

    for (let i = 0; i < positions.length; i += 1) {
      const weight = targets[i][2]
      if (!weight) continue
      const station = stations[i]
      const targetX = targets[i][0] / weight
      const targetY = targets[i][1] / weight
      const degreePenalty = degree[i] >= 4 ? 0.62 : degree[i] === 3 ? 0.74 : degree[i] === 2 ? 0.92 : 1
      const interchangePenalty = station?.isInterchange ? 0.7 : 1
      const blend = clamp(config.octilinearBlend * degreePenalty * interchangePenalty, 0, 1)
      positions[i][0] = lerp(positions[i][0], targetX, blend)
      positions[i][1] = lerp(positions[i][1], targetY, blend)
    }

    if ((iteration + 1) % 8 === 0) {
      snapEdgesToEightDirections(positions, edgeRecords, 0.2)
    }
  }

  const maxExactPasses = Math.max(1, Math.floor(config.octilinearExactPasses || 1))
  const strictTolerance = Math.max(1e-7, toFiniteNumber(config.octilinearStrictTolerance, 0.0008))
  for (let pass = 0; pass < maxExactPasses; pass += 1) {
      let maxResidual = 0
      for (const edge of edgeRecords) {
        const from = positions[edge.fromIndex]
        const to = positions[edge.toIndex]
        if (!from || !to) {
          console.error('[CONSTRAINT] enforceOctilinearHardConstraints - missing positions', {
            edgeId: edge.id,
            fromIndex: edge.fromIndex,
            toIndex: edge.toIndex,
            fromExists: !!from,
            toExists: !!to
          })
          continue
        }
        const dx = to[0] - from[0]
        const dy = to[1] - from[1]
        const length = Math.max(distance(from, to), 0.00001)
        const snapped = snapAngle(Math.atan2(dy, dx))
        const targetDx = Math.cos(snapped) * length
        const targetDy = Math.sin(snapped) * length
        const errX = targetDx - dx
        const errY = targetDy - dy
        maxResidual = Math.max(maxResidual, Math.hypot(errX, errY))

        const fromDegree = Math.max(degree[edge.fromIndex], 1)
        const toDegree = Math.max(degree[edge.toIndex], 1)
        let fromMove = toDegree / (fromDegree + toDegree)
        let toMove = fromDegree / (fromDegree + toDegree)
        if (fromDegree === 1 && toDegree > 1) {
          fromMove = 1
          toMove = 0
        } else if (toDegree === 1 && fromDegree > 1) {
          fromMove = 0
          toMove = 1
        }

        from[0] -= errX * fromMove
        from[1] -= errY * fromMove
        to[0] += errX * toMove
        to[1] += errY * toMove
      }
      if (maxResidual <= strictTolerance) break
    }
}

function enforceMinStationSpacing(positions, stations, edgeRecords, nodeDegrees, config) {
  const minDistance = Math.max(2, toFiniteNumber(config.minStationDistance, 30))
  const minEdgeLength = Math.max(2, toFiniteNumber(config.minEdgeLength, 32))
  const spacingPasses = Math.max(1, Math.floor(config.stationSpacingPasses || 1))
  const spacingStep = clamp(toFiniteNumber(config.stationSpacingStep, 0.58), 0.05, 1)
  const tolerance = Math.max(0, toFiniteNumber(config.stationSpacingTolerance, 0.06))
  const adjacentPairs = buildAdjacentPairSet(edgeRecords)

  for (let pass = 0; pass < spacingPasses; pass += 1) {
    const { grid, cellSize } = buildSpatialGrid(positions, minDistance)

    const deltas = positions.map(() => [0, 0])
    let maxOverlap = 0

    for (let i = 0; i < positions.length; i += 1) {
      const [x, y] = positions[i]
      const baseX = toGridCellCoord(x, cellSize)
      const baseY = toGridCellCoord(y, cellSize)

      forEachNeighborBucket(grid, baseX, baseY, (bucket) => {
        for (const j of bucket) {
          if (j <= i) continue

          const posI = positions[i]
          const posJ = positions[j]

          if (!posI || !posJ) {
            console.error('[CONSTRAINT] enforceMinStationSpacing: missing position', {
              indexI: i,
              indexJ: j,
              posIExists: !!posI,
              posJExists: !!posJ
            })
            continue
          }

          const dx = posJ[0] - posI[0]
          const dy = posJ[1] - posI[1]
          const d = Math.hypot(dx, dy)
          const requiredDistance = requiredStationPairDistance(
            i,
            j,
            stations,
            minDistance,
            minEdgeLength,
            adjacentPairs,
          )
          if (d >= requiredDistance) continue

          const overlap = requiredDistance - d
          maxOverlap = Math.max(maxOverlap, overlap)

          let ux = 1
          let uy = 0
          if (d > 1e-6) {
            ux = dx / d
            uy = dy / d
          } else {
            const theta = ((i * 131 + j * 71) % 360) * (Math.PI / 180)
            ux = Math.cos(theta)
            uy = Math.sin(theta)
          }

          const move = overlap * 0.5 * spacingStep
          let ratioI = 0.5
          let ratioJ = 0.5
          if (overlap <= minDistance * 0.22) {
            const moveI = stationSpacingMobility(stations[i], nodeDegrees[i]) || 1
            const moveJ = stationSpacingMobility(stations[j], nodeDegrees[j]) || 1
            const normalizer = Math.max(moveI + moveJ, 1e-6)
            ratioI = moveI / normalizer
            ratioJ = moveJ / normalizer
          }

          deltas[i][0] -= ux * move * ratioI
          deltas[i][1] -= uy * move * ratioI
          deltas[j][0] += ux * move * ratioJ
          deltas[j][1] += uy * move * ratioJ
        }
      })
    }

    for (let i = 0; i < positions.length; i += 1) {
      positions[i][0] += deltas[i][0]
      positions[i][1] += deltas[i][1]
    }

    if (maxOverlap <= tolerance) break
  }
}

function enforceMinEdgeLength(positions, edgeRecords, stations, nodeDegrees, config) {
  const minEdgeLength = Math.max(2, toFiniteNumber(config.minEdgeLength, 32))
  const minStationDistance = Math.max(2, toFiniteNumber(config.minStationDistance, 30))
  const maxPasses = Math.max(1, Math.floor(config.edgeMinLengthPasses || 1))
  const step = clamp(toFiniteNumber(config.edgeMinLengthStep, 0.72), 0.05, 1)
  const tolerance = Math.max(0, toFiniteNumber(config.edgeMinLengthTolerance, 0.08))

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let maxShortfall = 0
    for (const edge of edgeRecords) {
      const from = positions[edge.fromIndex]
      const to = positions[edge.toIndex]
      const dx = to[0] - from[0]
      const dy = to[1] - from[1]
      const length = Math.hypot(dx, dy)
      const requiredLength = requiredAdjacentEdgeLength(
        edge,
        stations,
        minEdgeLength,
        minStationDistance,
      )
      if (length >= requiredLength) continue

      const shortfall = requiredLength - length
      maxShortfall = Math.max(maxShortfall, shortfall)

      let ux = 1
      let uy = 0
      if (length > 1e-6) {
        ux = dx / length
        uy = dy / length
      } else {
        const snappedAngle = directionIndexToAngle((edge.fromIndex * 17 + edge.toIndex * 29) % 8)
        ux = Math.cos(snappedAngle)
        uy = Math.sin(snappedAngle)
      }

      let fromMoveRatio = 0.5
      let toMoveRatio = 0.5
      if (shortfall <= minEdgeLength * 0.26) {
        const fromMobility = stationSpacingMobility(stations[edge.fromIndex], nodeDegrees[edge.fromIndex]) || 1
        const toMobility = stationSpacingMobility(stations[edge.toIndex], nodeDegrees[edge.toIndex]) || 1
        const mobilitySum = Math.max(fromMobility + toMobility, 1e-6)
        fromMoveRatio = fromMobility / mobilitySum
        toMoveRatio = toMobility / mobilitySum
      }
      const move = shortfall * step

      from[0] -= ux * move * fromMoveRatio
      from[1] -= uy * move * fromMoveRatio
      to[0] += ux * move * toMoveRatio
      to[1] += uy * move * toMoveRatio
    }
    if (maxShortfall <= tolerance) break
  }
}

function buildAdjacentPairSet(edgeRecords) {
  const set = new Set()
  for (const edge of edgeRecords || []) {
    const a = Math.min(edge.fromIndex, edge.toIndex)
    const b = Math.max(edge.fromIndex, edge.toIndex)
    set.add(`${a}:${b}`)
  }
  return set
}

function requiredStationPairDistance(i, j, stations, minDistance, minEdgeLength, adjacentPairs) {
  const key = `${Math.min(i, j)}:${Math.max(i, j)}`
  const adjacent = adjacentPairs?.has(key)
  const stationA = stations[i]
  const stationB = stations[j]
  const interchangeCount = Number(Boolean(stationA?.isInterchange)) + Number(Boolean(stationB?.isInterchange))

  let required = minDistance
  if (interchangeCount === 1) required = Math.max(required, minDistance + 5)
  if (interchangeCount === 2) required = Math.max(required, minDistance + 10)
  if (adjacent) {
    required = Math.max(required, minEdgeLength * 1.2, minDistance + 8)
    if (interchangeCount === 2) required = Math.max(required, minDistance + 16, minEdgeLength * 1.35)
  }
  return required
}

function requiredAdjacentEdgeLength(edge, stations, minEdgeLength, minStationDistance) {
  const stationA = stations[edge.fromIndex]
  const stationB = stations[edge.toIndex]
  const interchangeCount = Number(Boolean(stationA?.isInterchange)) + Number(Boolean(stationB?.isInterchange))

  let required = Math.max(minEdgeLength, minStationDistance * 1.15)
  if (interchangeCount === 1) required = Math.max(required, minStationDistance * 1.28)
  if (interchangeCount === 2) required = Math.max(required, minStationDistance * 1.5, minEdgeLength * 1.4)
  return required
}

function stationSpacingMobility(station, degree) {
  const safeDegree = Math.max(1, Number.isFinite(degree) ? degree : 1)
  const degreeFactor = 1 / (1 + (safeDegree - 1) * 0.46)
  const interchangeFactor = station?.isInterchange ? 0.72 : 1
  return degreeFactor * interchangeFactor
}


export { enforceOctilinearHardConstraints, enforceMinStationSpacing, enforceMinEdgeLength }
