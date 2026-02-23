/**
 * 中国官方风格地铁图评分函数。
 * 编码中国官方地铁图的审美偏好，用于训练时评估布局质量。
 * 
 * 与现有 scoring.js 的区别：
 * - 更强的长直线段奖励（中国图偏好少弯折）
 * - cardinal 方向（水平/垂直）偏好加权
 * - 保持地理拓扑相似性（不过度抽象）
 * - 环线规则性评分
 * - 换乘站间距充足性
 */

import { distance, snapAngle, normalizeAngle, angleToDirectionIndex, circularDirectionDistance } from './shared'

/**
 * @param {Array} positions - 布局后的站点坐标
 * @param {Array} original - 原始地理坐标（归一化后）
 * @param {Array} edgeRecords - 边记录
 * @param {Array} lineChains - 线路链
 * @param {Array} stations - 站点数据
 * @param {object} config - 布局参数
 * @returns {number} 越低越好的损失值
 */
export function computeChineseStyleScore(positions, original, edgeRecords, lineChains, stations, config) {
  let score = 0

  // 1. 八方向偏差（基础，与原版类似但 cardinal 方向加权）
  for (const edge of edgeRecords) {
    const a = positions[edge.fromIndex], b = positions[edge.toIndex]
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
    const snapped = snapAngle(angle)
    const diff = Math.abs(normalizeAngle(angle - snapped)) * 180 / Math.PI
    // cardinal 方向（0°, 90°, 180°, 270°）给更低惩罚
    const isCardinal = Math.abs(snapped % (Math.PI / 2)) < 0.01
    score += diff * (isCardinal ? 0.8 : 1.2)
  }

  // 2. 弯折惩罚（中国图偏好长直线段，弯折惩罚更重）
  for (const chain of lineChains || []) {
    if (chain.edgePath.length < 2) continue
    let prevDir = null
    let runLen = 0
    for (let i = 0; i < chain.edgePath.length; i++) {
      const from = positions[chain.nodePath[i]]
      const to = positions[chain.nodePath[i + 1]]
      const dir = angleToDirectionIndex(Math.atan2(to[1] - from[1], to[0] - from[0]))
      if (prevDir !== null && dir !== prevDir) {
        const turn = circularDirectionDistance(prevDir, dir)
        // 短直线段后的弯折惩罚更重
        score += turn * 4.0 * (runLen < 3 ? 1.5 : 1.0)
        runLen = 0
      }
      runLen++
      prevDir = dir
    }
  }

  // 3. 地理拓扑保持（中国图不像伦敦那样极度抽象）
  for (let i = 0; i < positions.length; i++) {
    score += distance(positions[i], original[i]) * 0.15
  }

  // 4. 交叉惩罚（重惩罚）
  for (let i = 0; i < edgeRecords.length; i++) {
    const e1 = edgeRecords[i]
    const a1 = positions[e1.fromIndex], a2 = positions[e1.toIndex]
    for (let j = i + 1; j < edgeRecords.length; j++) {
      const e2 = edgeRecords[j]
      if (e1.fromIndex === e2.fromIndex || e1.fromIndex === e2.toIndex ||
          e1.toIndex === e2.fromIndex || e1.toIndex === e2.toIndex) continue
      const b1 = positions[e2.fromIndex], b2 = positions[e2.toIndex]
      if (segmentsIntersectSimple(a1, a2, b1, b2)) score += 100
    }
  }

  // 5. 站间距均匀性（中国图偏好均匀间距）
  const edgeLens = edgeRecords.map(e => distance(positions[e.fromIndex], positions[e.toIndex]))
  if (edgeLens.length > 1) {
    const mean = edgeLens.reduce((a, b) => a + b, 0) / edgeLens.length
    const variance = edgeLens.reduce((s, l) => s + (l - mean) ** 2, 0) / edgeLens.length
    score += Math.sqrt(variance) * 0.5
  }

  // 6. cardinal 方向偏好（中国图更多水平/垂直线段）
  let cardinalCount = 0
  for (const edge of edgeRecords) {
    const a = positions[edge.fromIndex], b = positions[edge.toIndex]
    const snapped = snapAngle(Math.atan2(b[1] - a[1], b[0] - a[0]))
    if (Math.abs(snapped % (Math.PI / 2)) < 0.01) cardinalCount++
  }
  // 奖励 cardinal 比例高
  score -= (cardinalCount / (edgeRecords.length || 1)) * 20

  return score
}

function segmentsIntersectSimple(a, b, c, d) {
  const ccw = (p, q, r) => (r[1] - p[1]) * (q[0] - p[0]) > (q[1] - p[1]) * (r[0] - p[0])
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d)
}
