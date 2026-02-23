import {
  angleToDirectionIndex,
  circularDirectionDistance,
  clamp,
  directionIndexToAngle,
  distance,
  lerp,
  normalizeAngle,
} from './shared'

function buildLineChains(lines, edgeById) {
  const chains = []

  for (const line of lines || []) {
    const lineEdgeIds = [...new Set((line.edgeIds || []).filter((edgeId) => edgeById.has(edgeId)))]
    if (!lineEdgeIds.length) continue

    const adjacency = new Map()
    for (const edgeId of lineEdgeIds) {
      const edge = edgeById.get(edgeId)
      if (!edge) continue
      addLineAdjacency(adjacency, edge.fromIndex, edge.toIndex, edgeId)
      addLineAdjacency(adjacency, edge.toIndex, edge.fromIndex, edgeId)
    }

    const visited = new Set()

    for (const edgeId of lineEdgeIds) {
      if (visited.has(edgeId)) continue
      const edge = edgeById.get(edgeId)
      if (!edge) continue

      const degreeA = adjacency.get(edge.fromIndex)?.length || 0
      const degreeB = adjacency.get(edge.toIndex)?.length || 0
      const startNode = degreeA !== 2 ? edge.fromIndex : degreeB !== 2 ? edge.toIndex : edge.fromIndex
      const chain = walkLineChain(startNode, edgeId, adjacency, edgeById, visited)
      if (!chain.edgePath.length || chain.nodePath.length !== chain.edgePath.length + 1) continue

      chains.push({
        lineId: line.id,
        ...chain,
      })
    }
  }

  return chains
}

function addLineAdjacency(adjacency, nodeIndex, neighborIndex, edgeId) {
  if (!adjacency.has(nodeIndex)) adjacency.set(nodeIndex, [])
  adjacency.get(nodeIndex).push({ neighborIndex, edgeId })
}

function walkLineChain(startNode, firstEdgeId, adjacency, edgeById, visited) {
  const nodePath = [startNode]
  const edgePath = []

  let currentNode = startNode
  let previousNode = -1
  let edgeId = firstEdgeId
  let isCycle = false

  while (edgeId != null) {
    if (visited.has(edgeId)) break
    visited.add(edgeId)
    const edge = edgeById.get(edgeId)
    if (!edge) break

    const nextNode = edge.fromIndex === currentNode ? edge.toIndex : edge.fromIndex
    edgePath.push(edgeId)
    nodePath.push(nextNode)

    previousNode = currentNode
    currentNode = nextNode

    if (currentNode === startNode) {
      isCycle = true
      break
    }

    const options = (adjacency.get(currentNode) || []).filter(
      (item) => !visited.has(item.edgeId) && item.neighborIndex !== previousNode,
    )

    edgeId = options.length === 1 ? options[0].edgeId : null
  }

  return { nodePath, edgePath, isCycle }
}

function applyLineDirectionPlanning(positions, lineChains, stations, nodeDegrees, config) {
  const passes = Math.max(0, Math.floor(config.lineDirectionPasses || 0))
  if (!passes || !lineChains.length) return

  for (let pass = 0; pass < passes; pass += 1) {
    const targets = positions.map(() => [0, 0, 0])

    for (const chain of lineChains) {
      if (chain.edgePath.length < 2) continue
      const plan = planLineChainTargetPositions(chain, positions, config)
      if (!plan) continue

      for (let i = 0; i < chain.nodePath.length; i += 1) {
        const nodeIndex = chain.nodePath[i]
        if (chain.isCycle && i === chain.nodePath.length - 1 && nodeIndex === chain.nodePath[0]) continue

        const station = stations[nodeIndex]
        const degree = Math.max(nodeDegrees[nodeIndex] || 1, 1)
        const degreeFactor = degree >= 4 ? 0.55 : degree === 3 ? 0.7 : degree === 2 ? 0.9 : 1
        const interchangeFactor = station?.isInterchange ? 0.62 : 1
        const weight = degreeFactor * interchangeFactor

        targets[nodeIndex][0] += plan.nodeTargets[i][0] * weight
        targets[nodeIndex][1] += plan.nodeTargets[i][1] * weight
        targets[nodeIndex][2] += weight
      }
    }

    for (let i = 0; i < positions.length; i += 1) {
      const weight = targets[i][2]
      if (!weight) continue

      const targetX = targets[i][0] / weight
      const targetY = targets[i][1] / weight
      const station = stations[i]
      const degree = Math.max(nodeDegrees[i] || 1, 1)
      const degreeFactor = degree >= 4 ? 0.58 : degree === 3 ? 0.72 : degree === 2 ? 0.9 : 1
      const interchangeFactor = station?.isInterchange ? 0.74 : 1
      const blend = clamp(config.lineDirectionBlend * degreeFactor * interchangeFactor, 0, 1)

      positions[i][0] = lerp(positions[i][0], targetX, blend)
      positions[i][1] = lerp(positions[i][1], targetY, blend)
    }
  }
}

function planLineChainTargetPositions(chain, positions, config) {
  const edgeCount = chain.edgePath.length
  if (edgeCount < 2) return null

  const rawAngles = []
  const edgeLengths = []

  for (let i = 0; i < edgeCount; i += 1) {
    const from = positions[chain.nodePath[i]]
    const to = positions[chain.nodePath[i + 1]]
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    rawAngles.push(Math.atan2(dy, dx))
    edgeLengths.push(Math.max(distance(from, to), 0.00001))
  }

  const mainDirection = estimateChainMainDirection(chain, positions, rawAngles, edgeLengths)
  const localDirections = computeLocalMainDirections(rawAngles, edgeLengths, mainDirection)
  let directionSequence = solveDirectionSequence(rawAngles, localDirections, config)
  directionSequence = smoothShortDirectionRuns(directionSequence, rawAngles, mainDirection, config)

  const nodeTargets = [positions[chain.nodePath[0]].slice(0, 2)]

  for (let i = 0; i < edgeCount; i += 1) {
    const previous = nodeTargets[i]
    const angle = directionIndexToAngle(directionSequence[i])
    const length = edgeLengths[i]
    nodeTargets.push([
      previous[0] + Math.cos(angle) * length,
      previous[1] + Math.sin(angle) * length,
    ])
  }

  const lastIndex = nodeTargets.length - 1
  if (!chain.isCycle && lastIndex > 0) {
    const endIndex = chain.nodePath[lastIndex]
    const currentEnd = positions[endIndex]
    const deltaX = currentEnd[0] - nodeTargets[lastIndex][0]
    const deltaY = currentEnd[1] - nodeTargets[lastIndex][1]
    for (let i = 0; i <= lastIndex; i += 1) {
      const t = i / lastIndex
      nodeTargets[i][0] += deltaX * t
      nodeTargets[i][1] += deltaY * t
    }
  } else if (chain.isCycle && lastIndex > 0) {
    const closureX = nodeTargets[lastIndex][0] - nodeTargets[0][0]
    const closureY = nodeTargets[lastIndex][1] - nodeTargets[0][1]
    for (let i = 0; i <= lastIndex; i += 1) {
      const t = i / lastIndex
      nodeTargets[i][0] -= closureX * t
      nodeTargets[i][1] -= closureY * t
    }
  }

  return { nodeTargets, directionSequence }
}

function estimateChainMainDirection(chain, positions, rawAngles, edgeLengths) {
  const firstNode = positions[chain.nodePath[0]]
  const lastNode = positions[chain.nodePath[chain.nodePath.length - 1]]
  const endDx = lastNode[0] - firstNode[0]
  const endDy = lastNode[1] - firstNode[1]

  if (!chain.isCycle && Math.hypot(endDx, endDy) > 0.00001) {
    return angleToDirectionIndex(Math.atan2(endDy, endDx))
  }

  let vx = 0
  let vy = 0
  for (let i = 0; i < rawAngles.length; i += 1) {
    const weight = edgeLengths[i]
    vx += Math.cos(rawAngles[i]) * weight
    vy += Math.sin(rawAngles[i]) * weight
  }
  if (Math.hypot(vx, vy) <= 0.00001) {
    return angleToDirectionIndex(rawAngles[0] || 0)
  }

  return angleToDirectionIndex(Math.atan2(vy, vx))
}

function computeLocalMainDirections(rawAngles, edgeLengths, globalMain) {
  const n = rawAngles.length
  if (n <= 6) return new Array(n).fill(globalMain)
  const windowRadius = 3
  const result = new Array(n)
  for (let i = 0; i < n; i += 1) {
    let vx = 0, vy = 0
    const lo = Math.max(0, i - windowRadius)
    const hi = Math.min(n - 1, i + windowRadius)
    for (let j = lo; j <= hi; j += 1) {
      vx += Math.cos(rawAngles[j]) * edgeLengths[j]
      vy += Math.sin(rawAngles[j]) * edgeLengths[j]
    }
    result[i] = Math.hypot(vx, vy) > 0.00001
      ? angleToDirectionIndex(Math.atan2(vy, vx))
      : globalMain
  }
  return result
}

function solveDirectionSequence(rawAngles, localDirections, config) {
  const edgeCount = rawAngles.length
  if (!edgeCount) return []

  const dp = Array.from({ length: edgeCount }, () => new Array(8).fill(Number.POSITIVE_INFINITY))
  const previousDirection = Array.from({ length: edgeCount }, () => new Array(8).fill(-1))

  const getMain = typeof localDirections === 'number'
    ? () => localDirections
    : (i) => localDirections[i]

  for (let direction = 0; direction < 8; direction += 1) {
    dp[0][direction] = directionUnaryCost(rawAngles[0], direction, getMain(0), config)
  }

  for (let edgeIndex = 1; edgeIndex < edgeCount; edgeIndex += 1) {
    for (let direction = 0; direction < 8; direction += 1) {
      const unaryCost = directionUnaryCost(rawAngles[edgeIndex], direction, getMain(edgeIndex), config)
      for (let prevDirection = 0; prevDirection < 8; prevDirection += 1) {
        const candidate =
          dp[edgeIndex - 1][prevDirection] +
          unaryCost +
          directionTurnCost(prevDirection, direction, config)
        if (candidate < dp[edgeIndex][direction]) {
          dp[edgeIndex][direction] = candidate
          previousDirection[edgeIndex][direction] = prevDirection
        }
      }
    }
  }

  let bestDirection = 0
  let bestCost = Number.POSITIVE_INFINITY
  for (let direction = 0; direction < 8; direction += 1) {
    if (dp[edgeCount - 1][direction] < bestCost) {
      bestCost = dp[edgeCount - 1][direction]
      bestDirection = direction
    }
  }

  const sequence = new Array(edgeCount).fill(0)
  sequence[edgeCount - 1] = bestDirection

  for (let edgeIndex = edgeCount - 1; edgeIndex > 0; edgeIndex -= 1) {
    sequence[edgeIndex - 1] = previousDirection[edgeIndex][sequence[edgeIndex]]
  }

  return sequence
}

function smoothShortDirectionRuns(sequence, rawAngles, mainDirection, config) {
  const minRunEdges = Math.max(1, Math.floor(config.lineMinRunEdges || 1))
  if (sequence.length < 3 || minRunEdges <= 1) return sequence

  const result = [...sequence]

  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false
    let runStart = 0

    while (runStart < result.length) {
      let runEnd = runStart + 1
      while (runEnd < result.length && result[runEnd] === result[runStart]) {
        runEnd += 1
      }

      const runLength = runEnd - runStart
      if (runLength < minRunEdges) {
        const candidates = []
        if (runStart > 0) candidates.push(result[runStart - 1])
        if (runEnd < result.length) candidates.push(result[runEnd])
        candidates.push(mainDirection)

        let bestDirection = result[runStart]
        let bestCost = Number.POSITIVE_INFINITY

        for (const direction of new Set(candidates)) {
          let candidateCost = 0
          for (let i = runStart; i < runEnd; i += 1) {
            candidateCost += directionUnaryCost(rawAngles[i], direction, mainDirection, config)
          }
          if (runStart > 0) {
            candidateCost += directionTurnCost(result[runStart - 1], direction, config)
          }
          if (runEnd < result.length) {
            candidateCost += directionTurnCost(direction, result[runEnd], config)
          }
          if (direction !== result[runStart]) {
            candidateCost -= config.lineShortRunPenalty
          }

          if (candidateCost < bestCost) {
            bestCost = candidateCost
            bestDirection = direction
          }
        }

        if (bestDirection !== result[runStart]) {
          for (let i = runStart; i < runEnd; i += 1) {
            result[i] = bestDirection
          }
          changed = true
        }
      }

      runStart = runEnd
    }

    if (!changed) break
  }

  return result
}

function directionUnaryCost(observedAngle, direction, mainDirection, config) {
  const targetAngle = directionIndexToAngle(direction)
  const angleDeviation = Math.abs(normalizeAngle(observedAngle - targetAngle))
  const mainDistance = circularDirectionDistance(direction, mainDirection)
  const isDiagonal = direction % 2 === 1
  const diagonalPenalty = isDiagonal ? (config.lineDiagonalPenalty || 0) : 0
  return angleDeviation * config.lineDataAngleWeight + mainDistance * config.lineMainDirectionWeight + diagonalPenalty
}

function directionTurnCost(previousDirection, nextDirection, config) {
  if (previousDirection === nextDirection) return 0
  const steps = circularDirectionDistance(previousDirection, nextDirection)
  let cost = config.lineTurnPenalty + steps * config.lineTurnStepPenalty
  if (steps >= 4) {
    cost += config.lineUTurnPenalty
  } else if (steps === 3) {
    cost += config.lineUTurnPenalty * 0.45
  }
  const prevDiag = previousDirection % 2 === 1
  const nextDiag = nextDirection % 2 === 1
  if (prevDiag && nextDiag) {
    cost += config.lineDiagonalToDiagonalTurnPenalty || 0
  }
  return cost
}


export { buildLineChains, applyLineDirectionPlanning }
