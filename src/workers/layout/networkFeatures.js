/**
 * 从地铁网络中提取 20 维图特征向量，供 ONNX 模型推理使用。
 * @param {Array} stations
 * @param {Array} edges
 * @param {Array} lines
 * @returns {number[]} 20 维特征
 */
export function extractNetworkFeatures(stations, edges, lines) {
  const n = stations.length || 1
  const e = edges.length
  const l = (lines || []).length || 1

  // 度数统计
  const deg = new Map()
  for (const edge of edges) {
    deg.set(edge.fromStationId, (deg.get(edge.fromStationId) || 0) + 1)
    deg.set(edge.toStationId, (deg.get(edge.toStationId) || 0) + 1)
  }
  const degrees = [...deg.values()]
  const maxDeg = Math.max(1, ...degrees)
  const avgDeg = degrees.length ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0
  const deg1 = degrees.filter(d => d === 1).length
  const deg3plus = degrees.filter(d => d >= 3).length

  // 坐标范围
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const s of stations) {
    const p = s.lngLat || s.displayPos || [0, 0]
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0])
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1])
  }
  const width = Math.max(maxX - minX, 1e-6)
  const height = Math.max(maxY - minY, 1e-6)
  const aspect = width / height

  // 边长统计
  const posMap = new Map()
  for (const s of stations) posMap.set(s.id, s.lngLat || s.displayPos || [0, 0])
  let totalLen = 0, minLen = Infinity, maxLen = 0
  for (const edge of edges) {
    const a = posMap.get(edge.fromStationId) || [0, 0]
    const b = posMap.get(edge.toStationId) || [0, 0]
    const d = Math.hypot(a[0] - b[0], a[1] - b[1])
    totalLen += d
    minLen = Math.min(minLen, d)
    maxLen = Math.max(maxLen, d)
  }
  const avgLen = e ? totalLen / e : 0
  if (!e) minLen = 0

  // 每条线路平均站数
  const avgStationsPerLine = n / l

  // 密度 = 2E / (V*(V-1))
  const density = n > 1 ? (2 * e) / (n * (n - 1)) : 0

  return [
    n,                    // 0: 站点数
    e,                    // 1: 边数
    l,                    // 2: 线路数
    avgDeg,               // 3: 平均度
    maxDeg,               // 4: 最大度
    deg1,                 // 5: 端点站数 (度=1)
    deg3plus,             // 6: 换乘站数 (度>=3)
    deg1 / n,             // 7: 端点站比例
    deg3plus / n,         // 8: 换乘站比例
    density,              // 9: 图密度
    width,                // 10: 经度跨度
    height,               // 11: 纬度跨度
    aspect,               // 12: 宽高比
    avgLen,               // 13: 平均边长
    minLen,               // 14: 最短边长
    maxLen,               // 15: 最长边长
    maxLen ? avgLen / maxLen : 0, // 16: 边长均匀度
    avgStationsPerLine,   // 17: 每线路平均站数
    e / n,                // 18: 边站比
    e / l,                // 19: 每线路平均边数
  ]
}
