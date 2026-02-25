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

import { getOrderedStationIds } from '../lineGraph'

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
 * 按年份分组统计，每年包含各期线路
 * @param {import('../projectModel').RailProject} project
 * @returns {Map<number|null, Array<{phase: string, lineName: string, fromStation: string, toStation: string, distance: number}>>}
 */
function buildYearStats(project) {
  const stationMap = new Map(project.stations.map((s) => [s.id, s]))
  const lineMap = new Map(project.lines.map((l) => [l.id, l]))
  const edgeMap = new Map(project.edges.map((e) => [e.id, e]))

  // 按年份分组
  const yearMap = new Map() // year -> Array of {phase, lineName, fromStation, toStation, distance}

  for (const line of project.lines || []) {
    const lineEdges = line.edgeIds.map((id) => edgeMap.get(id)).filter(Boolean)
    const lineName = line.nameZh || line.nameEn || line.id

    // 获取有序站点
    const orderedIds = getOrderedStationIds(line, edgeMap)
    if (!orderedIds.length) continue

    // 构建站点ID到站名的映射
    const getStationName = (id) => {
      const s = stationMap.get(id)
      return s ? (s.nameZh || s.nameEn || '未命名') : '???'
    }

    // 按边获取区间信息
    for (const edge of lineEdges) {
      const year = edge.openingYear
      const phase = edge.phase || ''
      const distance = edge.lengthMeters || 0

      const fromStation = getStationName(edge.fromStationId)
      const toStation = getStationName(edge.toStationId)

      const entry = { phase, lineName, fromStation, toStation, distance }

      if (!yearMap.has(year)) {
        yearMap.set(year, [])
      }
      yearMap.get(year).push(entry)
    }
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

    // 按线路分组，同一线路的同期合并
    const linePhaseMap = new Map() // key: "lineId|phase", value: {lineName, intervals: [], distance}

    for (const { phase, lineName, fromStation, toStation, distance } of entries) {
      // 使用线路名作为key（简单处理）
      const key = `${lineName}|${phase}`
      if (!linePhaseMap.has(key)) {
        linePhaseMap.set(key, { lineName, phase, intervals: [], distance: 0 })
      }
      const data = linePhaseMap.get(key)
      data.intervals.push(`${fromStation}—${toStation}`)
      data.distance += distance
      totalNetworkDistance += distance
    }

    // 按线路名排序
    const sortedEntries = Array.from(linePhaseMap.values()).sort((a, b) => {
      const nameCompare = a.lineName.localeCompare(b.lineName, 'zh')
      if (nameCompare !== 0) return nameCompare
      return a.phase.localeCompare(b.phase, 'zh')
    })

    for (const { lineName, phase, intervals, distance } of sortedEntries) {
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
