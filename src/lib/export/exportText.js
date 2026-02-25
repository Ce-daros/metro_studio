/**
 * 将线网工程导出为人类可读的纯文本格式
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
 * @param {import('../projectModel').RailProject} project
 * @returns {string} 人类可读的纯文本
 */
export function serializeProjectAsText(project) {
  if (!project) return ''

  const stationMap = new Map(project.stations.map((s) => [s.id, s]))
  const edgeMap = new Map(project.edges.map((e) => [e.id, e]))
  const lineMap = new Map(project.lines.map((l) => [l.id, l]))

  const out = []

  out.push(`【${project.name || '未命名工程'}】线网概览`)
  if (project.region?.name) out.push(`城市/区域: ${project.region.name}`)
  out.push('')

  for (let i = 0; i < project.lines.length; i++) {
    const line = project.lines[i]
    const statusLabel = STATUS_LABELS[line.status] || line.status
    const styleLabel = STYLE_LABELS[line.style] || line.style
    const header = line.nameZh || line.nameEn || `线路 ${i + 1}`
    const meta = [statusLabel, styleLabel, line.color].filter(Boolean).join(' | ')

    out.push(`━━ ${header}（${meta}）${line.isLoop ? ' ◎环线' : ''} ━━`)

    const orderedIds = getOrderedStationIds(line, edgeMap)
    if (!orderedIds.length) {
      out.push('  （暂无车站）')
    } else {
      const names = orderedIds.map((id) => {
        const s = stationMap.get(id)
        return s ? (s.nameZh || s.nameEn || '未命名') : '???'
      })
      const connector = line.isLoop ? ' → ' : ' — '
      const text = names.join(connector)
      out.push(line.isLoop ? `  ${text} → …` : `  ${text}`)
      out.push(`  共 ${orderedIds.length} 站`)
    }
    out.push('')
  }

  // 换乘站汇总
  const interchangeStations = project.stations.filter((s) => s.isInterchange)
  if (interchangeStations.length) {
    out.push('━━ 换乘站 ━━')
    for (const s of interchangeStations) {
      const belongLines = s.lineIds
        .map((lid) => lineMap.get(lid))
        .filter(Boolean)
        .map((l) => l.nameZh || l.nameEn)
      const transferLines = (s.transferLineIds || [])
        .filter((lid) => !s.lineIds.includes(lid))
        .map((lid) => lineMap.get(lid))
        .filter(Boolean)
        .map((l) => l.nameZh || l.nameEn)
      const allLines = [...new Set([...belongLines, ...transferLines])]
      out.push(`  ${s.nameZh || s.nameEn}: ${allLines.join(' ↔ ')}`)
    }
    out.push('')
  }

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
