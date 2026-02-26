/**
 * 图算法工具函数
 */

/**
 * 构建无向图邻接表
 * @param {Array} edges 边数组
 * @param {string} fromKey 起点属性名
 * @param {string} toKey 终点属性名
 * @returns {Map<string, string[]>}
 */
export function buildUndirectedAdjacencyGraph(edges, fromKey = 'fromStationId', toKey = 'toStationId') {
  const adj = new Map()
  for (const e of edges) {
    const from = e[fromKey]
    const to = e[toKey]
    if (!adj.has(from)) adj.set(from, [])
    if (!adj.has(to)) adj.set(to, [])
    adj.get(from).push(to)
    adj.get(to).push(from)
  }
  return adj
}

/**
 * BFS 查找连通分量
 * @param {Map<string, string[]>} adj 邻接表
 * @returns {string[][]} 连通分量数组
 */
export function findConnectedComponents(adj) {
  const visited = new Set()
  const components = []
  for (const nodeId of adj.keys()) {
    if (visited.has(nodeId)) continue
    const component = []
    const queue = [nodeId]
    visited.add(nodeId)
    while (queue.length) {
      const cur = queue.shift()
      component.push(cur)
      for (const nb of adj.get(cur)) {
        if (!visited.has(nb)) {
          visited.add(nb)
          queue.push(nb)
        }
      }
    }
    components.push(component)
  }
  return components
}

/**
 * 查找路径端点（度为1的节点）
 * @param {Map<string, string[]>} adj 邻接表
 * @param {string[]} [nodes] 可选的节点子集
 * @returns {string[]}
 */
export function findPathEndpoints(adj, nodes) {
  const nodeList = nodes || Array.from(adj.keys())
  return nodeList.filter((id) => (adj.get(id)?.length || 0) === 1)
}

/**
 * BFS 找最远节点（用于计算树直径）
 * @param {Map<string, string[]>} adj 邻接表
 * @param {string} startNode 起始节点
 * @returns {string} 最远节点 ID
 */
export function findFarthestNode(adj, startNode) {
  const dist = new Map([[startNode, 0]])
  const queue = [startNode]
  let farthest = startNode
  let maxDist = 0
  while (queue.length) {
    const cur = queue.shift()
    for (const nb of adj.get(cur) || []) {
      if (!dist.has(nb)) {
        dist.set(nb, dist.get(cur) + 1)
        queue.push(nb)
        if (dist.get(nb) > maxDist) {
          maxDist = dist.get(nb)
          farthest = nb
        }
      }
    }
  }
  return farthest
}

/**
 * 线性遍历：从起点沿邻接表走到底
 * @param {Map<string, string[]>} adj 邻接表
 * @param {string} startNode 起始节点
 * @returns {string[]} 有序节点列表
 */
export function findLinearPath(adj, startNode) {
  const ordered = [startNode]
  const visited = new Set([startNode])
  let current = startNode
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
