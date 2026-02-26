import { buildUndirectedAdjacencyGraph, findLinearPath, findPathEndpoints } from './graphUtils'

/**
 * 沿边遍历，得到一条线路的有序站点列表
 * @param {import('./projectModel').RailLine} line
 * @param {Map<string, import('./projectModel').RailEdge>} edgeMap
 * @returns {string[]} 有序 stationId 列表
 */
export function getOrderedStationIds(line, edgeMap) {
  const edges = line.edgeIds.map((id) => edgeMap.get(id)).filter(Boolean)
  if (!edges.length) return []

  const adj = buildUndirectedAdjacencyGraph(edges)
  const endpoints = findPathEndpoints(adj)
  const start = endpoints.length > 0 ? endpoints[0] : edges[0].fromStationId

  return findLinearPath(adj, start)
}
