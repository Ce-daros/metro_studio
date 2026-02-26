/**
 * 将线网工程导出为人类可读的纯文本格式
 * 按年份分组，显示每年开通的各期线路
 */

const STATUS_LABELS = {
  open: '运营中',
  construction: '在建',
  proposed: '规划',
}

const STYLE_LABELS = {
  metro: '地铁',
  commuter: '市域铁路',
  'light-rail': '轻轨',
  tram: '有轨电车',
}

/**
 * 格式化距离显示
 * @param {number} meters 米
 * @returns {string} 格式化后的距离
 */
function formatDistance(meters) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }
  return `${Math.round(meters)} m`
}

/**
 * 将一组边合并为连续区间，返回每个连通分量的起止站名
 * @param {Array} edges 边数组
 * @param {(id: string) => string} getStationName 站名查询函数
 * @returns {string[]} 区间字符串数组，如 ["段店—齐鲁软件园", "xxx—yyy"]
 */
function mergeEdgesIntoIntervals(edges, getStationName) {
  if (!edges.length) return []

  // 构建邻接表
  const adj = new Map()
  for (const e of edges) {
    if (!adj.has(e.fromStationId)) adj.set(e.fromStationId, [])
    if (!adj.has(e.toStationId)) adj.set(e.toStationId, [])
    adj.get(e.fromStationId).push(e.toStationId)
    adj.get(e.toStationId).push(e.fromStationId)
  }

  // BFS 找连通分量
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

  // 对每个连通分量，找起止站
  const intervals = []
  for (const comp of components) {
    const endpoints = comp.filter((id) => adj.get(id).length === 1)

    if (endpoints.length === 0) {
      // 环线
      intervals.push(`${getStationName(comp[0])}环线`)
    } else if (endpoints.length === 2) {
      // 简单链：从一端走到另一端
      const start = endpoints[0]
      const end = endpoints[1]
      intervals.push(`${getStationName(start)}—${getStationName(end)}`)
    } else {
      // 有分支的树：BFS 找直径（最远两端点）
      const bfs = (startId) => {
        const dist = new Map([[startId, 0]])
        const q = [startId]
        let farthest = startId
        let maxDist = 0
        while (q.length) {
          const c = q.shift()
          for (const nb of adj.get(c)) {
            if (!dist.has(nb)) {
              dist.set(nb, dist.get(c) + 1)
              q.push(nb)
              if (dist.get(nb) > maxDist) {
                maxDist = dist.get(nb)
                farthest = nb
              }
            }
          }
        }
        return farthest
      }
      const far1 = bfs(endpoints[0])
      const far2 = bfs(far1)
      intervals.push(`${getStationName(far1)}—${getStationName(far2)}`)
    }
  }
  return intervals
}

/**
 * 按年份分组统计，每年包含各期线路（边已合并为连续区间）
 * @param {import('../projectModel').RailProject} project
 * @returns {Map<number|null, Array<{phase: string, lineName: string, intervals: string[], distance: number}>>}
 */
function buildYearStats(project) {
  const stationMap = new Map(project.stations.map((s) => [s.id, s]))
  const edgeMap = new Map(project.edges.map((e) => [e.id, e]))

  const getStationName = (id) => {
    const s = stationMap.get(id)
    return s ? s.nameZh || s.nameEn || '未命名' : '???'
  }

  // year -> lineKey -> { phase, lineName, edges[], distance }
  const yearLineMap = new Map()

  for (const line of project.lines || []) {
    const lineEdges = line.edgeIds.map((id) => edgeMap.get(id)).filter(Boolean)
    const lineName = line.nameZh || line.nameEn || line.id

    for (const edge of lineEdges) {
      const year = edge.openingYear
      const phase = edge.phase || ''
      const key = `${lineName}|${phase}`

      if (!yearLineMap.has(year)) yearLineMap.set(year, new Map())
      const lineMap = yearLineMap.get(year)
      if (!lineMap.has(key)) lineMap.set(key, { phase, lineName, edges: [], distance: 0 })

      const data = lineMap.get(key)
      data.edges.push(edge)
      data.distance += edge.lengthMeters || 0
    }
  }

  // 合并边为连续区间
  const yearMap = new Map()
  for (const [year, lineMap] of yearLineMap) {
    const entries = []
    for (const { phase, lineName, edges, distance } of lineMap.values()) {
      const intervals = mergeEdgesIntoIntervals(edges, getStationName)
      entries.push({ phase, lineName, intervals, distance })
    }
    yearMap.set(year, entries)
  }

  return yearMap
}

/**
 * @param {import('../projectModel').RailProject} project
 * @returns {string} 人类可读的纯文本
 */
export function serializeProjectAsText(project) {
  if (!project) return ''

  const out = []

  out.push(`【${project.name || '未命名工程'}】线网概览`)
  if (project.region?.name) out.push(`城市/区域: ${project.region.name}`)
  out.push('')

  // 按年份统计
  const yearMap = buildYearStats(project)
  let totalNetworkDistance = 0

  // 获取排序后的年份列表
  const sortedYears = Array.from(yearMap.keys())
    .filter((y) => y != null)
    .sort((a, b) => a - b)
  // 把 null（未定年份）放到最后
  if (yearMap.has(null)) sortedYears.push(null)

  for (const year of sortedYears) {
    const entries = yearMap.get(year) || []
    if (!entries.length) continue

    const yearLabel = year == null ? '未定年份' : `${year}年`
    out.push(`━━ ${yearLabel} ━━`)

    // 按线路名排序
    const sortedEntries = [...entries].sort((a, b) => {
      const nameCompare = a.lineName.localeCompare(b.lineName, 'zh')
      if (nameCompare !== 0) return nameCompare
      return a.phase.localeCompare(b.phase, 'zh')
    })

    for (const { lineName, phase, intervals, distance } of sortedEntries) {
      totalNetworkDistance += distance
      const intervalStr = intervals.join('、')
      const phaseLabel = phase ? `${lineName}${phase}（${intervalStr}）` : `${lineName}（${intervalStr}）`
      out.push(`  ${phaseLabel}: ${formatDistance(distance)}`)
    }

    out.push('')
  }

  // 如果没有任何年份信息
  if (yearMap.size === 0) {
    out.push('  （暂无标记年份的线路）')
    out.push('')
  }

  // 线网总里程
  out.push(`━━ 线网统计 ━━`)
  out.push(`  线路总数: ${project.lines?.length || 0} 条`)
  out.push(`  车站总数: ${project.stations?.length || 0} 座`)
  out.push(`  线网总里程: ${formatDistance(totalNetworkDistance)}`)
  out.push('')

  out.push(`导出时间: ${new Date().toLocaleString('zh-CN')}`)
  return out.join('\n')
}

/**
 * @param {import('../projectModel').RailProject} project
 */
export function downloadProjectText(project) {
  const text = serializeProjectAsText(project)
  const safeName = (project?.name || 'metro-studio').replace(/[<>:"/\\|?*]+/g, '_').trim()
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeName}_线网概览.txt`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * @param {import('../projectModel').RailProject} project
 * @returns {Promise<boolean>} 是否成功复制
 */
export async function copyProjectTextToClipboard(project) {
  const text = serializeProjectAsText(project)
  await navigator.clipboard.writeText(text)
  return true
}
