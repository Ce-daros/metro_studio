import { angleToDirectionIndex, distance } from './shared'

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

export { buildLineChains }
