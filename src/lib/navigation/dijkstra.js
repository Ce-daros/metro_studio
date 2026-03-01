import { haversineDistanceMeters } from '../geo'

/**
 * 最小优先队列（二叉堆），用于 Dijkstra 算法。
 * 每个元素为 { key, priority }。
 */
class MinPriorityQueue {
  constructor() {
    this._heap = []
  }

  get size() {
    return this._heap.length
  }

  push(key, priority) {
    this._heap.push({ key, priority })
    this._bubbleUp(this._heap.length - 1)
  }

  pop() {
    const heap = this._heap
    if (!heap.length) return null
    const top = heap[0]
    const last = heap.pop()
    if (heap.length > 0) {
      heap[0] = last
      this._sinkDown(0)
    }
    return top
  }

  _bubbleUp(i) {
    const heap = this._heap
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap[parent].priority <= heap[i].priority) break
      ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
      i = parent
    }
  }

  _sinkDown(i) {
    const heap = this._heap
    const n = heap.length
    while (true) {
      let smallest = i
      const left = 2 * i + 1
      const right = 2 * i + 2
      if (left < n && heap[left].priority < heap[smallest].priority) smallest = left
      if (right < n && heap[right].priority < heap[smallest].priority) smallest = right
      if (smallest === i) break
      ;[heap[smallest], heap[i]] = [heap[i], heap[smallest]]
      i = smallest
    }
  }
}

/**
 * 构建邻接表。
 * @param {Array} edges - 项目中的所有边
 * @returns {Map<string, Array<{neighbor: string, edgeId: string, weight: number}>>}
 */
function buildAdjacencyList(edges) {
  const adj = new Map()
  for (const edge of edges) {
    const { id, fromStationId, toStationId, lengthMeters } = edge
    const weight = lengthMeters || 0
    if (!adj.has(fromStationId)) adj.set(fromStationId, [])
    if (!adj.has(toStationId)) adj.set(toStationId, [])
    adj.get(fromStationId).push({ neighbor: toStationId, edgeId: id, weight })
    adj.get(toStationId).push({ neighbor: fromStationId, edgeId: id, weight })
  }
  return adj
}

/**
 * 在给定坐标附近查找候选站点。
 * @param {Array} stations - 所有站点
 * @param {number[]} lngLat - [lng, lat]
 * @param {number} radiusMeters - 搜索半径（米）
 * @param {number} maxCount - 最多返回数量
 * @returns {Array<{stationId: string, walkMeters: number}>}
 */
function findCandidateStations(stations, lngLat, radiusMeters, maxCount) {
  const candidates = []
  for (const station of stations) {
    if (!Array.isArray(station.lngLat) || station.lngLat.length !== 2) continue
    const dist = haversineDistanceMeters(lngLat, station.lngLat)
    if (dist <= radiusMeters) {
      candidates.push({ stationId: station.id, walkMeters: dist })
    }
  }
  candidates.sort((a, b) => a.walkMeters - b.walkMeters)
  return candidates.slice(0, maxCount)
}

/**
 * 从 source 出发跑 Dijkstra，返回到所有可达节点的最短距离和前驱信息。
 * @param {Map} adj - 邻接表
 * @param {string} source - 起点站 ID
 * @returns {{ dist: Map<string, number>, prev: Map<string, {stationId: string, edgeId: string}> }}
 */
function dijkstra(adj, source) {
  const dist = new Map()
  const prev = new Map()
  const pq = new MinPriorityQueue()

  dist.set(source, 0)
  pq.push(source, 0)

  while (pq.size > 0) {
    const { key: u, priority: d } = pq.pop()
    if (d > (dist.get(u) ?? Infinity)) continue

    const neighbors = adj.get(u)
    if (!neighbors) continue

    for (const { neighbor: v, edgeId, weight } of neighbors) {
      const alt = d + weight
      if (alt < (dist.get(v) ?? Infinity)) {
        dist.set(v, alt)
        prev.set(v, { stationId: u, edgeId })
        pq.push(v, alt)
      }
    }
  }

  return { dist, prev }
}

/**
 * 从 Dijkstra 的 prev 映射中回溯路径。
 * @param {Map} prev - 前驱映射
 * @param {string} source - 起点站 ID
 * @param {string} target - 终点站 ID
 * @returns {{ stationIds: string[], edgeIds: string[] } | null}
 */
function reconstructPath(prev, source, target) {
  const stationIds = [target]
  const edgeIds = []
  let current = target

  while (current !== source) {
    const entry = prev.get(current)
    if (!entry) return null // 不可达
    edgeIds.push(entry.edgeId)
    stationIds.push(entry.stationId)
    current = entry.stationId
  }

  stationIds.reverse()
  edgeIds.reverse()
  return { stationIds, edgeIds }
}

function normalizeEdgeLineIds(edge, lineById) {
  const ids = Array.isArray(edge?.sharedByLineIds) ? edge.sharedByLineIds : []
  const unique = new Set()
  const normalized = []
  for (const id of ids) {
    const lineId = String(id || '')
    if (!lineId || unique.has(lineId)) continue
    if (lineById.has(lineId)) {
      unique.add(lineId)
      normalized.push(lineId)
    }
  }
  return normalized
}

function pickLineByOrder(lineIds, lineOrderMap) {
  if (!lineIds.length) return null
  const sorted = [...lineIds].sort((a, b) => {
    const rankA = lineOrderMap.has(a) ? lineOrderMap.get(a) : Number.MAX_SAFE_INTEGER
    const rankB = lineOrderMap.has(b) ? lineOrderMap.get(b) : Number.MAX_SAFE_INTEGER
    if (rankA !== rankB) return rankA - rankB
    return a.localeCompare(b)
  })
  return sorted[0]
}

function pickSegmentLineId(edge, preferredLineId, nextEdge, lineById, lineOrderMap) {
  const candidates = normalizeEdgeLineIds(edge, lineById)
  if (!candidates.length) return null
  if (preferredLineId && candidates.includes(preferredLineId)) return preferredLineId

  const nextCandidates = normalizeEdgeLineIds(nextEdge, lineById)
  if (nextCandidates.length) {
    const shared = candidates.filter((lineId) => nextCandidates.includes(lineId))
    if (shared.length) return pickLineByOrder(shared, lineOrderMap)
  }

  return pickLineByOrder(candidates, lineOrderMap)
}

/**
 * 根据路径中的边和站点，构建分段信息（按线路分段）。
 * @param {string[]} edgeIds - 经过的边 ID 列表
 * @param {string[]} stationIds - 经过的站点 ID 列表
 * @param {Map<string, Object>} edgeById - 边 ID → 边对象
 * @param {Map<string, Object>} stationById - 站点 ID → 站点对象
 * @param {Map<string, Object>} lineById - 线路 ID → 线路对象
 * @param {Map<string, number>} lineOrderMap - 线路顺序映射
 * @returns {Array<{lineId: string, lineName: string, lineColor: string, fromStation: string, toStation: string, fromStationId: string, toStationId: string, stationCount: number, distanceMeters: number}>}
 */
function buildSegments(edgeIds, stationIds, edgeById, stationById, lineById, lineOrderMap) {
  if (!edgeIds.length) return []

  const segments = []
  let currentLineId = null
  let segmentStart = 0
  let segmentDistance = 0

  for (let i = 0; i < edgeIds.length; i++) {
    const edge = edgeById.get(edgeIds[i])
    if (!edge) continue
    const nextEdge = i + 1 < edgeIds.length ? edgeById.get(edgeIds[i + 1]) : null
    const lineId = pickSegmentLineId(edge, currentLineId, nextEdge, lineById, lineOrderMap)

    if (lineId !== currentLineId && currentLineId !== null) {
      // 线路切换，结束当前段
      const line = lineById.get(currentLineId)
      const fromSt = stationById.get(stationIds[segmentStart])
      const toSt = stationById.get(stationIds[i])
      segments.push({
        lineId: currentLineId,
        lineName: line?.nameZh || '未知线路',
        lineColor: line?.color || '#888',
        fromStation: fromSt?.nameZh || '未知站',
        toStation: toSt?.nameZh || '未知站',
        fromStationId: stationIds[segmentStart],
        toStationId: stationIds[i],
        stationCount: i - segmentStart + 1,
        distanceMeters: segmentDistance,
      })
      segmentStart = i
      segmentDistance = 0
    }

    currentLineId = lineId
    segmentDistance += edge.lengthMeters || 0
  }

  // 最后一段
  if (currentLineId !== null) {
    const line = lineById.get(currentLineId)
    const fromSt = stationById.get(stationIds[segmentStart])
    const toSt = stationById.get(stationIds[stationIds.length - 1])
    segments.push({
      lineId: currentLineId,
      lineName: line?.nameZh || '未知线路',
      lineColor: line?.color || '#888',
      fromStation: fromSt?.nameZh || '未知站',
      toStation: toSt?.nameZh || '未知站',
      fromStationId: stationIds[segmentStart],
      toStationId: stationIds[stationIds.length - 1],
      stationCount: stationIds.length - segmentStart,
      distanceMeters: segmentDistance,
    })
  }

  return segments
}

/**
 * 计算从 originLngLat 到 destLngLat 的最短综合路径。
 *
 * 算法：
 * 1. 找起点/终点附近候选站点
 * 2. 构建邻接表
 * 3. 对每个起点候选跑 Dijkstra
 * 4. 对每对 (起点候选, 终点候选) 计算总距离 = 步行到起点站 + 地铁 + 步行离开终点站
 * 5. 返回总距离最短的方案
 *
 * @param {Object} params
 * @param {Array} params.stations - 所有站点
 * @param {Array} params.edges - 所有边
 * @param {Array} params.lines - 所有线路
 * @param {number[]} params.originLngLat - 起点坐标 [lng, lat]
 * @param {number[]} params.destLngLat - 终点坐标 [lng, lat]
 * @param {number} [params.candidateRadius=3000] - 候选站点搜索半径（米）
 * @param {number} [params.maxCandidates=5] - 每侧最多候选站点数
 * @param {number} [params.walkWeight=5] - 步行距离权重，优先选择地铁出行
 */
export function computeShortestRoute({
  stations,
  edges,
  lines,
  originLngLat,
  destLngLat,
  candidateRadius = 3000,
  maxCandidates = 5,
  walkWeight = 5,
}) {
  if (!stations?.length || !edges?.length) return null

  const originCandidates = findCandidateStations(stations, originLngLat, candidateRadius, maxCandidates)
  const destCandidates = findCandidateStations(stations, destLngLat, candidateRadius, maxCandidates)

  if (!originCandidates.length || !destCandidates.length) return null

  const adj = buildAdjacencyList(edges)

  // 构建查找映射
  const edgeById = new Map(edges.map((e) => [e.id, e]))
  const stationById = new Map(stations.map((s) => [s.id, s]))
  const lineById = new Map((lines || []).map((l) => [l.id, l]))
  const lineOrderMap = new Map()
  for (let i = 0; i < (lines || []).length; i += 1) {
    const lineId = String(lines[i]?.id || '')
    if (!lineId || lineOrderMap.has(lineId)) continue
    lineOrderMap.set(lineId, i)
  }

  let bestResult = null
  let bestTotal = Infinity

  // 对每个起点候选跑一次 Dijkstra，然后检查所有终点候选
  for (const originCandidate of originCandidates) {
    const { dist, prev } = dijkstra(adj, originCandidate.stationId)

    for (const destCandidate of destCandidates) {
      // 起点和终点不能是同一个站
      if (originCandidate.stationId === destCandidate.stationId) continue

      const transitDist = dist.get(destCandidate.stationId)
      if (transitDist == null || transitDist === Infinity) continue

      const totalDist = originCandidate.walkMeters * walkWeight + transitDist + destCandidate.walkMeters * walkWeight

      if (totalDist < bestTotal) {
        const path = reconstructPath(prev, originCandidate.stationId, destCandidate.stationId)
        if (!path) continue

        const segments = buildSegments(path.edgeIds, path.stationIds, edgeById, stationById, lineById, lineOrderMap)

        bestTotal = totalDist
        bestResult = {
          originStationId: originCandidate.stationId,
          destStationId: destCandidate.stationId,
          edgeIds: path.edgeIds,
          stationIds: path.stationIds,
          walkToOriginMeters: originCandidate.walkMeters,
          walkFromDestMeters: destCandidate.walkMeters,
          transitMeters: transitDist,
          totalMeters: totalDist,
          segments,
        }
      }
    }
  }

  return bestResult
}
