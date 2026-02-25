/**
 * 沿边遍历，得到一条线路的有序站点列表
 * @param {import('./projectModel').RailLine} line
 * @param {Map<string, import('./projectModel').RailEdge>} edgeMap
 * @returns {string[]} 有序 stationId 列表
 */
export function getOrderedStationIds(line, edgeMap) {
  const edges = line.edgeIds.map((id) => edgeMap.get(id)).filter(Boolean)
  if (!edges.length) return []

  const adj = new Map()
  for (const e of edges) {
    if (!adj.has(e.fromStationId)) adj.set(e.fromStationId, [])
    if (!adj.has(e.toStationId)) adj.set(e.toStationId, [])
    adj.get(e.fromStationId).push(e.toStationId)
    adj.get(e.toStationId).push(e.fromStationId)
  }

  let start = edges[0].fromStationId
  for (const [id, neighbors] of adj) {
    if (neighbors.length === 1) { start = id; break }
  }

  const ordered = [start]
  const visited = new Set([start])
  let current = start
  while (true) {
    const neighbors = adj.get(current) || []
    const next = neighbors.find((n) => !visited.has(n))
    if (!next) break
    ordered.push(next)
    visited.add(next)
    current = next
  }
  return ordered
}
