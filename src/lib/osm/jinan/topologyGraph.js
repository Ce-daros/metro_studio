import { haversineDistanceMeters, projectLngLat } from '../../geo'

function addAdjacency(adjacency, fromId, toId, weight) {
  if (!adjacency.has(fromId)) {
    adjacency.set(fromId, [])
  }
  adjacency.get(fromId).push({ to: toId, weight })
}

function buildRelationAdjacency(relation, ways, nodes) {
  const adjacency = new Map()
  for (const member of relation.members || []) {
    if (member.type !== 'way') continue
    const way = ways.get(member.ref)
    if (!way?.nodes || way.nodes.length < 2) continue
    for (let i = 0; i < way.nodes.length - 1; i += 1) {
      const fromNode = nodes.get(way.nodes[i])
      const toNode = nodes.get(way.nodes[i + 1])
      if (!fromNode || !toNode) continue
      const from = toNodeLngLat(fromNode)
      const to = toNodeLngLat(toNode)
      const weight = haversineDistanceMeters(from, to)
      addAdjacency(adjacency, way.nodes[i], way.nodes[i + 1], weight)
      addAdjacency(adjacency, way.nodes[i + 1], way.nodes[i], weight)
    }
  }
  return adjacency
}

function buildGlobalAdjacency(relations, ways, nodes) {
  const adjacency = new Map()
  const visitedWays = new Set()
  for (const relation of relations) {
    for (const member of relation.members || []) {
      if (member.type !== 'way' || visitedWays.has(member.ref)) continue
      visitedWays.add(member.ref)
      const way = ways.get(member.ref)
      if (!way?.nodes || way.nodes.length < 2) continue
      for (let i = 0; i < way.nodes.length - 1; i += 1) {
        const fromNode = nodes.get(way.nodes[i])
        const toNode = nodes.get(way.nodes[i + 1])
        if (!fromNode || !toNode) continue
        const from = toNodeLngLat(fromNode)
        const to = toNodeLngLat(toNode)
        const weight = haversineDistanceMeters(from, to)
        addAdjacency(adjacency, way.nodes[i], way.nodes[i + 1], weight)
        addAdjacency(adjacency, way.nodes[i + 1], way.nodes[i], weight)
      }
    }
  }
  return adjacency
}

class MinHeap {
  constructor() {
    this.values = []
  }

  push(item) {
    this.values.push(item)
    this.bubbleUp(this.values.length - 1)
  }

  pop() {
    if (!this.values.length) return null
    const top = this.values[0]
    const end = this.values.pop()
    if (this.values.length && end) {
      this.values[0] = end
      this.bubbleDown(0)
    }
    return top
  }

  get size() {
    return this.values.length
  }

  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.values[parent].dist <= this.values[index].dist) break
      ;[this.values[parent], this.values[index]] = [this.values[index], this.values[parent]]
      index = parent
    }
  }

  bubbleDown(index) {
    const length = this.values.length
    while (true) {
      const left = index * 2 + 1
      const right = index * 2 + 2
      let smallest = index
      if (left < length && this.values[left].dist < this.values[smallest].dist) {
        smallest = left
      }
      if (right < length && this.values[right].dist < this.values[smallest].dist) {
        smallest = right
      }
      if (smallest === index) break
      ;[this.values[smallest], this.values[index]] = [this.values[index], this.values[smallest]]
      index = smallest
    }
  }
}

class UnionFind {
  constructor(ids) {
    this.parent = new Map(ids.map((id) => [id, id]))
    this.rank = new Map(ids.map((id) => [id, 0]))
  }

  find(id) {
    const parent = this.parent.get(id)
    if (parent === id) {
      return id
    }
    const root = this.find(parent)
    this.parent.set(id, root)
    return root
  }

  union(a, b) {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA === rootB) return

    const rankA = this.rank.get(rootA) || 0
    const rankB = this.rank.get(rootB) || 0

    if (rankA < rankB) {
      this.parent.set(rootA, rootB)
      return
    }
    if (rankA > rankB) {
      this.parent.set(rootB, rootA)
      return
    }
    this.parent.set(rootB, rootA)
    this.rank.set(rootA, rankA + 1)
  }
}

function shortestPath(adjacency, start, goal) {
  if (start === goal) return [start]
  const heap = new MinHeap()
  const dist = new Map([[start, 0]])
  const prev = new Map()
  const visited = new Set()

  heap.push({ id: start, dist: 0 })

  while (heap.size) {
    const current = heap.pop()
    if (!current || visited.has(current.id)) continue
    if (current.id === goal) break
    visited.add(current.id)

    for (const edge of adjacency.get(current.id) || []) {
      const nextDist = current.dist + edge.weight
      if (nextDist < (dist.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        dist.set(edge.to, nextDist)
        prev.set(edge.to, current.id)
        heap.push({ id: edge.to, dist: nextDist })
      }
    }
  }

  if (!prev.has(goal)) {
    return [start, goal]
  }

  const path = [goal]
  let cursor = goal
  while (prev.has(cursor)) {
    cursor = prev.get(cursor)
    path.push(cursor)
    if (cursor === start) break
  }
  return path.reverse()
}

function hasSharedLine(lineSetA, lineSetB) {
  if (!lineSetA || !lineSetB) return false
  for (const lineId of lineSetA) {
    if (lineSetB.has(lineId)) return true
  }
  return false
}

function sumPathLength(waypoints) {
  let length = 0
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    length += haversineDistanceMeters(waypoints[i], waypoints[i + 1])
  }
  return length
}

function distanceSquared(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 2 || b.length !== 2) {
    return Number.POSITIVE_INFINITY
  }
  const dx = Number(a[0]) - Number(b[0])
  const dy = Number(a[1]) - Number(b[1])
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return Number.POSITIVE_INFINITY
  }
  return dx * dx + dy * dy
}

function orientWaypointsByEndpoints(waypoints, fromLngLat, toLngLat) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return [fromLngLat, toLngLat]
  }
  const first = waypoints[0]
  const last = waypoints[waypoints.length - 1]
  const directError = distanceSquared(first, fromLngLat) + distanceSquared(last, toLngLat)
  const reverseError = distanceSquared(first, toLngLat) + distanceSquared(last, fromLngLat)
  const ordered = reverseError < directError ? [...waypoints].reverse() : [...waypoints]
  ordered[0] = [...fromLngLat]
  ordered[ordered.length - 1] = [...toLngLat]
  return ordered
}

function assignCompactDisplayPositions(stations) {
  if (!stations.length) return

  const projected = stations.map((station) => projectLngLat(station.lngLat))
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const [x, y] of projected) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const targetLongest = 1480
  const scale = targetLongest / Math.max(width, height)
  const yCompression = 0.88

  for (let i = 0; i < stations.length; i += 1) {
    const [x, y] = projected[i]
    stations[i].displayPos = [(x - minX) * scale, (maxY - y) * scale * yCompression]
  }
}

function toNodeLngLat(node) {
  return [Number(node.lon), Number(node.lat)]
}

export {
  MinHeap,
  UnionFind,
  shortestPath,
  addAdjacency,
  buildRelationAdjacency,
  buildGlobalAdjacency,
  hasSharedLine,
  sumPathLength,
  distanceSquared,
  orientWaypointsByEndpoints,
  assignCompactDisplayPositions,
  toNodeLngLat,
}
